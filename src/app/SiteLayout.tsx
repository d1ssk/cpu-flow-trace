import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useLocale } from '../i18n';
import { NotFoundPage } from '../pages/NotFoundPage';

export function SiteLayout() {
  const { locale, t } = useLocale();
  const params = useParams();
  const location = useLocation();
  const alternateLocale = locale === 'ja' ? 'en' : 'ja';
  const alternatePath = location.pathname.replace(/^\/(ja|en)(?=\/|$)/, `/${alternateLocale}`);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `How a CPU Works — ${t.tagline}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${t.tagline} ${t.introduction}`);
  }, [locale, t]);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <>
    <a href="#main" className="skip-link">{t.skip}</a>
    <header className="site-header">
      <div className="site-identity">
        <Link className="brand" to={`/${locale}/`}>How a <span className="brand-cpu">CPU</span> Works</Link>
        <p className="site-tagline">{t.tagline}</p>
      </div>
      <nav className="main-nav" aria-label={locale === 'ja' ? 'メインナビゲーション' : 'Main navigation'}>
        <NavLink to={`/${locale}/`} end>{t.simulator}</NavLink>
        <NavLink to={`/${locale}/learn/`}>{t.learn}</NavLink>
      </nav>
      <div className="header-end">
        <div className="signal-legend"><span><i />L</span><span><i className="high-dot" />H</span></div>
        <div className="language-switch" aria-label={t.language}>
          <span aria-current="true">{locale === 'ja' ? '日本語' : 'EN'}</span>
          <span className="language-divider">/</span>
          <Link to={`${alternatePath}${location.search}${location.hash}`} lang={alternateLocale} hrefLang={alternateLocale}>{alternateLocale === 'ja' ? '日本語' : 'EN'}</Link>
        </div>
      </div>
    </header>
    <main id="main" tabIndex={-1}>
      {params.locale !== 'ja' && params.locale !== 'en' ? <NotFoundPage /> : <Outlet />}
    </main>
    <footer className="site-footer">© <a href="https://d1ssk.github.io/">Daichi Sasaki</a></footer>
  </>;
}
