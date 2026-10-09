import {handleProductionValidation} from '@/lib/engineering/production-validation';
export const runtime='nodejs';
export const maxDuration=30;
export const GET=handleProductionValidation;
export const POST=handleProductionValidation;
