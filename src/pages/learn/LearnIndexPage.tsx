import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { ArticleCards } from './ArticleCards';
export function LearnIndexPage() {
  const { locale, t } = useLocale();
  return <div className="learn-page">
    <Link className="back-link" to={`/${locale}/`}>← {t.backHome}</Link>
    <div className="learn-intro"><h1>{t.learn}</h1><p>{t.articlesIntro}</p></div>
    <ArticleCards />
  </div>;
}
