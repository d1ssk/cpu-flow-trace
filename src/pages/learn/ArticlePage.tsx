import { Link, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { articles, articleGroups, articleNumber } from '../../articles';
import { NotFoundPage } from '../NotFoundPage';

export function ArticlePage() {
  const { articleId } = useParams();
  const { locale, t } = useLocale();
  const index = articles.findIndex(item => item.id === articleId);
  const article = articles[index];
  if (!article) return <NotFoundPage />;
  const previous = articles[index - 1];
  const next = articles[index + 1];
  const group = articleGroups.find(item => item.id === article.group)!;
  return <article className="article-content">
    <Link className="back-link" to={`/${locale}/learn/`}>← {t.backLearn}</Link>
    <div className="learn-intro">
      <p className="eyebrow">{articleNumber(article)} · {group.title[locale]}</p>
      <h1>{article.title[locale]}</h1><p>{article.description[locale]}</p>
    </div>
    <section className="article-placeholder">
      <h2>{t.articlePlaceholder}</h2><p>{t.articlePlaceholderBody}</p>
      <Link className="primary-link" to={`/${locale}/`}>{t.backHome} <span aria-hidden="true">→</span></Link>
    </section>
    <nav className="article-pagination" aria-label={t.articleNavigation}>
      {previous && <Link className="previous-article text-link" to={`/${locale}/learn/${previous.id}/`}>
        <span>← {t.previousArticle}</span><span>{articleNumber(previous)} · {previous.title[locale]}</span>
      </Link>}
      {next && <Link className="next-article text-link" to={`/${locale}/learn/${next.id}/`}>
        <span>{t.nextArticle} →</span><span>{articleNumber(next)} · {next.title[locale]}</span>
      </Link>}
    </nav>
  </article>;
}
