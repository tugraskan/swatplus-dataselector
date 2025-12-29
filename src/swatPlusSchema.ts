/**
 * SWAT+ Schema Definitions
 * Based on swatplus-editor database schema
 * Source: https://github.com/swat-model/swatplus-editor
 * 
 * This file defines the known foreign key relationships in SWAT+ files
 * based on the official SWAT+ Editor database schema.
 */

export interface SchemaRelation {
    sourceTable: string;      // Database table name (e.g., "hru_data_hru")
    sourceFile: string;        // File base name (e.g., "hru")
    foreignKeyField: string;   // Field name in source (e.g., "hydro")
    targetTable: string;       // Target database table (e.g., "hydrology_hyd")
    targetFile: string;        // Target file base name (e.g., "hydrology")
    fieldName: string;         // Friendly display name
}

/**
 * SWAT+ Editor schema-based relationships
 * These are the officially defined foreign key relationships in SWAT+
 */
export const SWAT_SCHEMA_RELATIONS: SchemaRelation[] = [
    // HRU Data (hru.hru / hru_data.hru)
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'topo', targetTable: 'topography_hyd', targetFile: 'topography', fieldName: 'Topography' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'hydro', targetTable: 'hydrology_hyd', targetFile: 'hydrology', fieldName: 'Hydrology' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'soil', targetTable: 'soils_sol', targetFile: 'soil', fieldName: 'Soil' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'lu_mgt', targetTable: 'landuse_lum', targetFile: 'landuse', fieldName: 'Land Use' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'soil_plant_init', targetTable: 'soil_plant_ini', targetFile: 'plant_ini', fieldName: 'Plant Init' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'surf_stor', targetTable: 'wetland_wet', targetFile: 'wetland', fieldName: 'Wetland' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'snow', targetTable: 'snow_sno', targetFile: 'snow', fieldName: 'Snow' },
    { sourceTable: 'hru_data_hru', sourceFile: 'hru', foreignKeyField: 'field', targetTable: 'field_fld', targetFile: 'field', fieldName: 'Field' },
    
    // HRU LTE (hru-lte.hru)
    { sourceTable: 'hru_lte_hru', sourceFile: 'hru-lte', foreignKeyField: 'soil_text', targetTable: 'soils_lte_sol', targetFile: 'soils_lte', fieldName: 'Soil' },
    { sourceTable: 'hru_lte_hru', sourceFile: 'hru-lte', foreignKeyField: 'grow_start', targetTable: 'd_table_dtl', targetFile: 'd_table', fieldName: 'Grow Start' },
    { sourceTable: 'hru_lte_hru', sourceFile: 'hru-lte', foreignKeyField: 'grow_end', targetTable: 'd_table_dtl', targetFile: 'd_table', fieldName: 'Grow End' },
    { sourceTable: 'hru_lte_hru', sourceFile: 'hru-lte', foreignKeyField: 'plnt_typ', targetTable: 'plants_plt', targetFile: 'plants', fieldName: 'Plant Type' },
    
    // Connections (hru.con)
    { sourceTable: 'hru_con', sourceFile: 'hru', foreignKeyField: 'wst', targetTable: 'weather_sta_cli', targetFile: 'weather-sta', fieldName: 'Weather Station' },
    { sourceTable: 'hru_con', sourceFile: 'hru', foreignKeyField: 'cst', targetTable: 'constituents_cs', targetFile: 'constituents', fieldName: 'Constituents' },
    { sourceTable: 'hru_con', sourceFile: 'hru', foreignKeyField: 'hru', targetTable: 'hru_data_hru', targetFile: 'hru_data', fieldName: 'HRU Data' },
    
    // Routing Unit (rout_unit.con)
    { sourceTable: 'rout_unit_con', sourceFile: 'rout_unit', foreignKeyField: 'rtu', targetTable: 'rout_unit_rtu', targetFile: 'rout_unit', fieldName: 'Routing Unit' },
    
    // Aquifer (aquifer.con)
    { sourceTable: 'aquifer_con', sourceFile: 'aquifer', foreignKeyField: 'aqu', targetTable: 'aquifer_aqu', targetFile: 'aquifer', fieldName: 'Aquifer' },
    
    // Channel (channel.con)
    { sourceTable: 'channel_con', sourceFile: 'channel', foreignKeyField: 'cha', targetTable: 'channel_cha', targetFile: 'channel', fieldName: 'Channel' },
    
    // Reservoir (reservoir.con)
    { sourceTable: 'reservoir_con', sourceFile: 'reservoir', foreignKeyField: 'res', targetTable: 'reservoir_res', targetFile: 'reservoir', fieldName: 'Reservoir' },
    
    // Channel data (channel.cha)
    { sourceTable: 'channel_cha', sourceFile: 'channel', foreignKeyField: 'hyd', targetTable: 'hydrology_hyd', targetFile: 'hydrology', fieldName: 'Hydrology' },
    
    // Reservoir data (reservoir.res)
    { sourceTable: 'reservoir_res', sourceFile: 'reservoir', foreignKeyField: 'hyd', targetTable: 'hydrology_hyd', targetFile: 'hydrology', fieldName: 'Hydrology' },
    { sourceTable: 'reservoir_res', sourceFile: 'reservoir', foreignKeyField: 'sed', targetTable: 'sediment_res', targetFile: 'sediment', fieldName: 'Sediment' },
    { sourceTable: 'reservoir_res', sourceFile: 'reservoir', foreignKeyField: 'init', targetTable: 'initial_res', targetFile: 'initial', fieldName: 'Initial' },
    
    // Land Use Management (landuse.lum)
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'plnt_com', targetTable: 'plant_ini', targetFile: 'plant_ini', fieldName: 'Plant Community' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'mgt', targetTable: 'management_sch', targetFile: 'management', fieldName: 'Management' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'cn2', targetTable: 'cntable_lum', targetFile: 'cntable', fieldName: 'CN Table' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'cons_prac', targetTable: 'cons_prac_lum', targetFile: 'cons_prac', fieldName: 'Conservation Practice' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'urban', targetTable: 'urban_urb', targetFile: 'urban', fieldName: 'Urban' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'ov_mann', targetTable: 'ovn_table_lum', targetFile: 'ovn_table', fieldName: 'Overland Manning' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'tile', targetTable: 'tiledrain_str', targetFile: 'tiledrain', fieldName: 'Tile Drain' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'sep', targetTable: 'septic_str', targetFile: 'septic', fieldName: 'Septic' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'vfs', targetTable: 'filterstrip_str', targetFile: 'filterstrip', fieldName: 'Filter Strip' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'grww', targetTable: 'grassedww_str', targetFile: 'grassedww', fieldName: 'Grassed Waterway' },
    { sourceTable: 'landuse_lum', sourceFile: 'landuse', foreignKeyField: 'bmp', targetTable: 'bmpuser_str', targetFile: 'bmpuser', fieldName: 'BMP' },
    
    // Management Schedule (management.sch)
    { sourceTable: 'management_sch_auto', sourceFile: 'management', foreignKeyField: 'd_table', targetTable: 'd_table_dtl', targetFile: 'd_table', fieldName: 'Decision Table' },
    
    // Plant Init Items
    { sourceTable: 'plant_ini_item', sourceFile: 'plant_ini', foreignKeyField: 'plnt_name', targetTable: 'plants_plt', targetFile: 'plants', fieldName: 'Plant Name' },
    
    // Aquifer data (aquifer.aqu)
    { sourceTable: 'aquifer_aqu', sourceFile: 'aquifer', foreignKeyField: 'init', targetTable: 'initial_aqu', targetFile: 'initial', fieldName: 'Initial' },
    
    // Recall data
    { sourceTable: 'recall_rec', sourceFile: 'recall', foreignKeyField: 'rec_typ', targetTable: 'rec_typ', targetFile: 'rec_typ', fieldName: 'Recall Type' },
];

/**
 * Get file name variations for a base name
 * SWAT+ files can have various extensions and naming patterns
 */
export function getFileVariations(baseName: string): string[] {
    const variations: string[] = [];
    
    // Direct name with common extensions
    const extensions = ['.hru', '.hyd', '.sol', '.cli', '.con', '.cha', '.aqu', '.res', '.lum', '.pcp', '.tmp', '.wnd', '.txt'];
    for (const ext of extensions) {
        variations.push(baseName + ext);
    }
    
    // Common patterns
    variations.push(`${baseName}.hru`);
    variations.push(`${baseName}_data.hru`);
    variations.push(`${baseName}-data.hru`);
    
    return variations;
}
