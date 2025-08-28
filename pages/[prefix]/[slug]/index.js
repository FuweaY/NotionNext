import BLOG from '@/blog.config'
import { siteConfig } from '@/lib/config'
import { getGlobalData, getPost } from '@/lib/db/getSiteData'
import { checkSlugHasOneSlash, processPostData } from '@/lib/utils/post'
import { idToUuid } from 'notion-utils'
import Slug from '..'

/**
 * 根据notion的slug访问页面
 * 解析二级目录 /article/about
 * @param {*} props
 * @returns
 */
const PrefixSlug = props => {
  return <Slug {...props} />
}

export async function getStaticPaths() {
  if (!BLOG.isProd) {
    return {
      paths: [],
      fallback: true
    }
  }

  const from = 'slug-paths'
  const { allPages } = await getGlobalData({ from })

  // 根据slug中的 / 分割成prefix和slug两个字段 ; 例如 article/test
  // 最终用户可以通过  [domain]/[prefix]/[slug] 路径访问，即这里的 [domain]/article/test
  const paths = allPages
    ?.filter(row => checkSlugHasOneSlash(row))
    .map(row => ({
      params: { prefix: row.slug.split('/')[0], slug: row.slug.split('/')[1] }
    }))

  // 增加一种访问路径 允许通过 [category]/[slug] 访问文章
  // 例如文章slug 是 test ，然后文章的分类category是 production
  // 则除了 [domain]/[slug] 以外，还支持分类名访问: [domain]/[category]/[slug]

  return {
    paths: paths,
    fallback: true
  }
}

export async function getStaticProps({ params: { prefix, slug }, locale }) {
  try {
    const fullSlug = prefix + '/' + slug
    const from = `slug-props-${fullSlug}`
    const props = await getGlobalData({ from, locale })

    // 在列表内查找文章
    if (props?.allPages && Array.isArray(props.allPages)) {
      props.post = props.allPages.find(p => {
        if (!p || typeof p !== 'object') return false
        
        // 安全檢查 type
        const hasValidType = p.type && typeof p.type === 'string' && p.type.indexOf('Menu') < 0
        if (!hasValidType) return false
        
        // 安全檢查 slug 和 id
        const slugMatches = p.slug && (p.slug === slug || p.slug === fullSlug)
        const idMatches = fullSlug && p.id && (() => {
          try {
            return p.id === idToUuid(fullSlug)
          } catch {
            return false
          }
        })()
        
        return slugMatches || idMatches
      })
    }

    // 处理非列表内文章的内信息
    if (!props?.post && slug) {
      try {
        const slugArray = slug.split ? slug.split('') : []
        const pageId = slugArray.length > 0 ? slugArray[slugArray.length - 1] : null
        if (pageId && typeof pageId === 'string' && pageId.length >= 32) {
          const post = await getPost(pageId)
          props.post = post
        }
      } catch (e) {
        console.error('Error getting post by pageId:', e)
      }
    }

    if (!props?.post) {
      // 无法获取文章
      props.post = null
    } else {
      try {
        await processPostData(props, from)
      } catch (e) {
        console.error('Error processing post data:', e)
      }
    }
    
    return {
      props: props || {},
      revalidate: process.env.EXPORT
        ? undefined
        : siteConfig(
            'NEXT_REVALIDATE_SECOND',
            BLOG.NEXT_REVALIDATE_SECOND,
            props?.NOTION_CONFIG
          )
    }
  } catch (error) {
    console.error('Error in getStaticProps [prefix]/[slug]:', error)
    return {
      props: { post: null },
      revalidate: 60
    }
  }
}

export default PrefixSlug
