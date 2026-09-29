import * as assert from 'assert';
import { managementSchOpTarget } from '../managementSchOps';

// Columns of an operation line: op, mon, day, husc, op_data1, op_data2, op_data3.
const OP_DATA1 = 4;
const OP_DATA2 = 5;
const OP_DATA3 = 6;

suite('management.sch operation links', () => {

    test('op_data1 is looked up where read_mgtops.f90 looks up op_char', () => {
        assert.strictEqual(managementSchOpTarget('plnt', OP_DATA1), 'plants_plt');
        assert.strictEqual(managementSchOpTarget('pcom', OP_DATA1), 'plant_ini');
        assert.strictEqual(managementSchOpTarget('till', OP_DATA1), 'tillage_til');
        assert.strictEqual(managementSchOpTarget('irrp', OP_DATA1), 'irr_ops');
        assert.strictEqual(managementSchOpTarget('fert', OP_DATA1), 'fertilizer_frt');
        assert.strictEqual(managementSchOpTarget('manu', OP_DATA1), 'manure_db_frt');
        assert.strictEqual(managementSchOpTarget('burn', OP_DATA1), 'fire_ops');
    });

    test('op_data2 is looked up where read_mgtops.f90 looks up op_plant', () => {
        assert.strictEqual(managementSchOpTarget('harv', OP_DATA2), 'harv_ops');
        assert.strictEqual(managementSchOpTarget('hvkl', OP_DATA2), 'harv_ops');
        assert.strictEqual(managementSchOpTarget('plnt', OP_DATA2), 'transplant_plt');
        assert.strictEqual(managementSchOpTarget('fert', OP_DATA2), 'chem_app_ops');
        assert.strictEqual(managementSchOpTarget('pest', OP_DATA2), 'chem_app_ops');
    });

    test('nothing else on the line is a link', () => {
        assert.strictEqual(managementSchOpTarget('harv', OP_DATA1), undefined);
        assert.strictEqual(managementSchOpTarget('hvkl', OP_DATA1), undefined);
        assert.strictEqual(managementSchOpTarget('kill', OP_DATA1), undefined);
        assert.strictEqual(managementSchOpTarget('till', OP_DATA2), undefined);
        assert.strictEqual(managementSchOpTarget('fert', OP_DATA3), undefined);
        assert.strictEqual(managementSchOpTarget('fert', 0), undefined);
        assert.strictEqual(managementSchOpTarget('irra', OP_DATA1), undefined);
        assert.strictEqual(managementSchOpTarget('constructor', OP_DATA1), undefined);
    });
});
