import Providers from '../Providers';
import AdminActivity from './AdminActivity';
import AdminContactForms from './AdminContactForms';
import AdminDashboard from './AdminDashboard';
import AdminEvents from './AdminEvents';
import AdminGallery from './AdminGallery';
import AdminHours from './AdminHours';
import AdminMenu from './AdminMenu';
import AdminRedirects from './AdminRedirects';
import AdminReservations from './AdminReservations';
import AdminSidebar from './AdminSidebar';
import AdminContent from './AdminContent';
import AdminPages from './AdminPages';

export default function AdminPage({
  currentPath,
  page,
}: {
  currentPath: string;
  page:
    | 'dashboard'
    | 'events'
    | 'gallery'
    | 'menu'
    | 'reservations'
    | 'contact'
    | 'hours'
    | 'content'
    | 'pages'
    | 'activity'
    | 'redirects';
}) {
  const pages = {
    dashboard: AdminDashboard,
    events: AdminEvents,
    gallery: AdminGallery,
    menu: AdminMenu,
    reservations: AdminReservations,
    contact: AdminContactForms,
    hours: AdminHours,
    content: AdminContent,
    pages: AdminPages,
    activity: AdminActivity,
    redirects: AdminRedirects,
  };

  const PageComponent = pages[page];

  return (
    <Providers>
      <AdminSidebar currentPath={currentPath} />
      <main className="flex-1 overflow-auto">
        <PageComponent />
      </main>
    </Providers>
  );
}
