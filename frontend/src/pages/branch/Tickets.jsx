// Communication → Tickets (not in this install's menu)
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { CardHeader, EmptyState } from '../../components/ui.jsx';

export default function Tickets() {
  const { t } = useT();
  const auth = useAuth();
  return (
    <div className="card">
      <CardHeader icon={MessageCircle} title={t('menu.tickets')} subtitle={auth.activeClinic?.name} />
      <EmptyState message={t('tickets.empty')} />
    </div>
  );
}
