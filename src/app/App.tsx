import { lazy, Suspense } from 'react';
import { ModulePage } from '../pages/modules/ModulePage';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';
import { HomePage } from '../pages/home/HomePage';
import { LearnIndexPage } from '../pages/learn/LearnIndexPage';
import { ArticlePage } from '../pages/learn/ArticlePage';
import { NotFoundPage } from '../pages/NotFoundPage';

const Ft16Index = lazy(() => import('../pages/ft16/Ft16Pages').then(m => ({ default: m.Ft16IndexPage })));
const Ft16Stage = lazy(() => import('../pages/ft16/Ft16Pages').then(m => ({ default: m.Ft16StagePage })));
const Ft16Isa = lazy(() => import('../pages/ft16/IsaPage').then(m => ({ default: m.Ft16IsaPage })));
const ftPage = (page: React.ReactNode) => <Suspense fallback={<p className="learn-page" role="status">Loading FT16…</p>}>{page}</Suspense>;

export function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/ja/" replace />} />
    <Route path="/:locale" element={<SiteLayout />}>
      <Route index element={<HomePage />} />
      <Route path="modules/:moduleId" element={<ModulePage />} />
      <Route path="ft16" element={ftPage(<Ft16Index />)} />
      <Route path="ft16/isa" element={ftPage(<Ft16Isa />)} />
      <Route path="ft16/:stageId" element={ftPage(<Ft16Stage />)} />
      <Route path="learn" element={<LearnIndexPage />} />
      <Route path="learn/:articleId" element={<ArticlePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
