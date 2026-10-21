import { Link } from 'react-router-dom';
import { articles, articleGroups, articleNumber } from '../../articles';
import { useLocale } from '../../i18n';

export function ArticleCards() {
  const { locale, t } = useLocale();
  return <div className="article-groups">
    {articleGroups.map(group => <section className="article-group" key={group.id} aria-labelledby={`group-${group.id}`}>
      <h2 id={`group-${group.id}`}>{group.title[locale]}</h2>
      <ol className="article-cards" start={articles.findIndex(article => article.group === group.id) + 1}>
        {articles.filter(article => article.group === group.id).map(article => <li key={article.id}>
          <Link className="article-card" to={`/${locale}/learn/${article.id}/`}>
            <span className="article-number" aria-hidden="true">{articleNumber(article)}</span>
            <div className="article-card-body"><div className="article-card-heading">
              <h3>{article.title[locale]}</h3><span className="coming-label">{t.coming}</span>
            </div><p>{article.description[locale]}</p></div>
            <span className="article-arrow" aria-hidden="true">→</span>
          </Link>
        </li>)}
      </ol>
    </section>)}
  </div>;
}
