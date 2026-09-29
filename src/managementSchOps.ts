/**
 * Pure (vscode-free) table of the links on a management.sch operation line.
 *
 * `read_mgtops.f90` reads an operation line as op, mon, day, husc, op_char,
 * op_plant, op3, so op_char is op_data1 (the fifth value) and op_plant is
 * op_data2 (the sixth), and then looks some of those names up by operation
 * type. This is that table, for SWAT+ 62.0.x. Operations it does not look up
 * (kill, skip, ...) have no links, and neither does op_data1 of harv/hvkl:
 * `mgt_sched.f90` compares that plant name at run time with the HRU's plant
 * community, or "all".
 *
 * `MANAGEMENT_SCH_OP_LINKS` in `scripts/pandas_indexer.py` holds the same table.
 */

export const MANAGEMENT_SCH_OP_DATA_INDEX = { op_data1: 4, op_data2: 5 } as const;

export type ManagementSchOpColumn = keyof typeof MANAGEMENT_SCH_OP_DATA_INDEX;

export const MANAGEMENT_SCH_OP_LINKS: Readonly<Record<string, Partial<Record<ManagementSchOpColumn, string>>>> = {
    pcom: { op_data1: 'plant_ini' },                                   // pcomdb%name
    plnt: { op_data1: 'plants_plt', op_data2: 'transplant_plt' },      // pldb%plantnm, transpl%name
    harv: { op_data2: 'harv_ops' },                                    // harvop_db%name
    hvkl: { op_data2: 'harv_ops' },                                    // harvop_db%name
    till: { op_data1: 'tillage_til' },                                 // tilldb%tillnm
    irrm: { op_data1: 'irr_ops' },                                     // irrop_db%name
    irrp: { op_data1: 'irr_ops' },                                     // irrop_db%name
    fert: { op_data1: 'fertilizer_frt', op_data2: 'chem_app_ops' },    // fertdb%fertnm, chemapp_db%name
    manu: { op_data1: 'manure_db_frt', op_data2: 'chem_app_ops' },     // manure_db%name, chemapp_db%name
    pest: { op_data1: 'pesticide_pes', op_data2: 'chem_app_ops' },     // pestdb%name, chemapp_db%name
    graz: { op_data1: 'graze_ops' },                                   // grazeop_db%name
    burn: { op_data1: 'fire_ops' },                                    // fire_db%name
    swep: { op_data1: 'sweep_ops' },                                   // sweepop_db%name
};

/**
 * The table SWAT+ looks up the value at `columnIndex` of an operation line in,
 * or undefined when it looks nothing up there.
 */
export function managementSchOpTarget(opType: string, columnIndex: number): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(MANAGEMENT_SCH_OP_LINKS, opType)) {
        return undefined;
    }
    const links = MANAGEMENT_SCH_OP_LINKS[opType];
    for (const column of Object.keys(links) as ManagementSchOpColumn[]) {
        if (MANAGEMENT_SCH_OP_DATA_INDEX[column] === columnIndex) {
            return links[column];
        }
    }
    return undefined;
}
