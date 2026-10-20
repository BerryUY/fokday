import { handleBackupById } from '../../lib/handlers';
import { route } from '../../lib/vercel';

export default route(handleBackupById, 'id');
