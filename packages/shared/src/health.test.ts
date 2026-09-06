import {expect,test} from 'vitest';
import {healthSchema} from './index.js';
test('health contract rejects unexpected status',()=>{expect(healthSchema.safeParse({status:'down'}).success).toBe(false);});

