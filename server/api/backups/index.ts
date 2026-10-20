import { handleBackups } from '../../lib/handlers';
import { route } from '../../lib/vercel';

export default route(handleBackups);
