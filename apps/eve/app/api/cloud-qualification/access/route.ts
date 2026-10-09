import 'server-only';
import { qualifyCloudAccess } from '../../../../lib/engineering/cloud-access-qualification.ts';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) { return qualifyCloudAccess(request, process.env); }
