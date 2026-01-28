import Providers from '../Providers';
import AdminContactForms from './AdminContactForms';
import AdminDashboard from './AdminDashboard';
import AdminEvents from './AdminEvents';
import AdminGallery from './AdminGallery';
import AdminHours from './AdminHours';
import AdminMenu from './AdminMenu';
import AdminPrivateEvents from './AdminPrivateEvents';
import AdminReservations from './AdminReservations';
import AdminSidebar from './AdminSidebar';

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
    | 'private-events'
    | 'contact'
    | 'hours';
}) {
  const pages = {
    dashboard: AdminDashboard,
    events: AdminEvents,
    gallery: AdminGallery,
    menu: AdminMenu,
    reservations: AdminReservations,
    'private-events': AdminPrivateEvents,
    contact: AdminContactForms,
    hours: AdminHours,
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
