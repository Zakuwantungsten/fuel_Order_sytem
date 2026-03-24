import * as dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { SystemConfig } from '../models/SystemConfig';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const config = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
  console.log('Hydrated securitySettings.password:', JSON.stringify(config?.securitySettings?.password, null, 2));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
