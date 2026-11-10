import { useEffect, useState } from 'react'
import type { AppData } from '../App'
import { NewsCard, NewsStatus } from '../components/ClassNews'
import NewsManager from '../components/NewsManager'
import BirthdayManager from '../components/BirthdayManager'
import { TopBar } from '../components/ui'
import { canManageNews, NEWS_CATEGORIES, sortedNews, type NewsCategory } from '../lib/news'

export default function News({ data }: { data: AppData }) {
  const manager = canManageNews(data.user)
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? ''))
  const [category, setCategory] = useState<NewsCategory | ''>('')
  const [shown, setShown] = useState(20)
  useEffect(() => {
    const change = () => setQuery(new URLSearchParams(location.hash.split('?')[1] ?? ''))
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  const requestedView = query.get('view')
  const view = manager && (requestedView === 'manage' || requestedView === 'birthdays') ? requestedView : 'archive'
  const requestedPost = query.get('id')
  const posts = sortedNews(data.news, data.newsDay, category || undefined)
  const selected = requestedPost ? sortedNews(data.news, data.newsDay).find(n => n.id === requestedPost) : null
  return (
    <>
      <TopBar user={data.user} />
      <header className="page-head" data-tour="news"><div className="page-head-text"><h1>Class News</h1></div></header>
      <p className="lead">Announcements, achievements and updates from the class.</p>
      <div className="news-toolbar">
        <a className="link-btn" href="#/">Back to homework</a>
        {manager && <nav className="news-views" aria-label="Class News views">
          <a href="#/news" aria-current={view === 'archive' ? 'page' : undefined}>Archive</a>
          <a href="#/news?view=manage" aria-current={view === 'manage' ? 'page' : undefined}>Manage news</a>
          <a href="#/news?view=birthdays" aria-current={view === 'birthdays' ? 'page' : undefined}>Birthdays</a>
        </nav>}
      </div>
      <NewsStatus data={data} />
      {data.newsStatus === 'ready' && (view === 'manage' ? <NewsManager data={data} /> : view === 'birthdays' ? <BirthdayManager data={data} /> : (
        <section className="stack news-archive">
          {requestedPost ? selected ? <>
            <a className="link-btn" href="#/news">Back to all news</a>
            <NewsCard item={selected} />
          </> : <div className="empty">This post is not available. <a href="#/news">View all news</a></div> : <>
            <label className="field news-category-filter"><span className="field-label">Category</span>
              <select value={category} onChange={e => { setCategory(e.target.value as NewsCategory | ''); setShown(20) }}>
                <option value="">All categories</option>
                {Object.entries(NEWS_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <p className="small muted">Automatic birthday greetings appear only on Today and are not saved here.</p>
            {posts.length ? <div className="news-feed">{posts.slice(0, shown).map(n => <NewsCard key={n.id} item={n} />)}</div>
              : <div className="empty">{category ? 'No news in this category yet.' : 'No class news has been published yet.'}</div>}
            {posts.length > shown && <button className="btn-secondary" onClick={() => setShown(n => n + 20)}>Show more news</button>}
          </>}
        </section>
      ))}
    </>
  )
}
