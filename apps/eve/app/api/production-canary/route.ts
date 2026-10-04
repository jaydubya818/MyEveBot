import {handleProductionCanary} from '@/lib/engineering/production-canary';
export const runtime='nodejs';
export const maxDuration=30;
export const POST=handleProductionCanary;
