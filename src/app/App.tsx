import { ModulePage } from '../pages/modules/ModulePage';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';
import { HomePage } from '../pages/home/HomePage';
import { LearnIndexPage } from '../pages/learn/LearnIndexPage';
import { ArticlePage } from '../pages/learn/ArticlePage';
import { NotFoundPage } from '../pages/NotFoundPage';

export function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/ja/" replace />} />
    <Route path="/:locale" element={<SiteLayout />}>
      <Route index element={<HomePage />} />
      <Route path="modules/:moduleId" element={<ModulePage />} />
      <Route path="learn" element={<LearnIndexPage />} />
      <Route path="learn/:articleId" element={<ArticlePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
