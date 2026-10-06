import { Suspense } from 'react';
import { useRoute } from './router';
import { FULLSCREEN, SCREENS } from './screens';
import Layout from './Layout';
import { Spinner, Toaster } from './components/kit';
import GlobalOverlays from './GlobalOverlays';

export default function App() {
  const route = useRoute();
  const Screen = SCREENS[route.name];
  const content = (
    <Suspense fallback={<div className="min-h-[60vh] grid place-items-center"><Spinner /></div>}>
      <Screen key={`${route.name}:${JSON.stringify(route.params)}`} params={route.params} />
    </Suspense>
  );
  return (
    <>
      {FULLSCREEN.includes(route.name) ? content : <Layout>{content}</Layout>}
      <GlobalOverlays />
      <Toaster />
    </>
  );
}
