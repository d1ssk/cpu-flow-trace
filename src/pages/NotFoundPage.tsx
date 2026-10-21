import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
export function NotFoundPage() {
  const { locale, t } = useLocale();
  return <div className="article-content"><p className="eyebrow">404</p><h1>{t.notFound}</h1><Link className="text-link" to={`/${locale}/`}>← {t.backHome}</Link></div>;
}
