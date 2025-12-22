from helpers.executable_api import ExecutableApi, Unbuffered
from database.project.setup import SetupProjectDatabase
from database.project import base as project_base
from database.project.config import Project_config
from helpers import utils

# Import all fileio modules
from fileio import (
	connect, exco, dr, recall, climate, channel, aquifer, hydrology, 
	reservoir, hru, lum, soils, init, routing_unit, regions, salts, 
	simulation, hru_parm_db, config, ops, structural, decision_table, 
	basin, change, water_rights, gwflow
)

import sys
import argparse
import os.path
import os


class ImportTextFiles(ExecutableApi):
	"""
	Import SWAT+ text files from a TxtInOut directory into a project SQLite database.
	This allows users to recreate a project database from existing text files.
	"""
	
	# Default version constants
	DEFAULT_EDITOR_VERSION = '3.0.0'
	DEFAULT_SWAT_VERSION = '60.5.4'
	DATABASE_TYPE_PROJECT = 'project'
	
	def __init__(self, project_db_file, txtinout_dir, editor_version=None, swat_version=None):
		# Initialize the project database connection and ensure schema exists
		SetupProjectDatabase.init(project_db_file)
		# Create necessary tables if they are not present (safe=True avoids overwriting)
		SetupProjectDatabase.create_tables()
		self.project_db_file = project_db_file
		self.project_db = project_base.db
		self.txtinout_dir = txtinout_dir
		self.editor_version = editor_version or self.DEFAULT_EDITOR_VERSION
		self.swat_version = swat_version or self.DEFAULT_SWAT_VERSION
		
		if not os.path.exists(txtinout_dir):
			sys.exit('The TxtInOut directory {dir} does not exist. Please verify the path exists and try again.'.format(dir=txtinout_dir))
	
	def __del__(self):
		SetupProjectDatabase.close()
	
	def import_files(self):
		"""
		Import all supported text files from the TxtInOut directory into the database.
		Files are imported in a specific order to satisfy foreign key dependencies.
		"""
		try:
			total = 0
			step = 5
			
			# Import files in dependency order
			self.emit_progress(total, "Starting import from text files...")
			
			# 1. Import simulation configuration files
			total = self.import_simulation(total, step)
			
			# 2. Import climate/weather files  
			total = self.import_climate(total, step)
			
			# 3. Import parameter database files (needed before HRU, channel, etc.)
			total = self.import_parm_db(total, step)
			
			# 4. Import soil files
			total = self.import_soils(total, step)
			
			# 5. Import decision tables
			total = self.import_decision_table(total, step)
			
			# 6. Import connection files
			total = self.import_connect(total, step)
			
			# 7. Import channel files
			total = self.import_channel(total, step)
			
			# 8. Import reservoir files
			total = self.import_reservoir(total, step)
			
			# 9. Import routing unit files
			total = self.import_routing_unit(total, step)
			
			# 10. Import aquifer files
			total = self.import_aquifer(total, step)
			
			# 11. Import HRU files
			total = self.import_hru(total, step)
			
			# 12. Import hydrology files
			total = self.import_hydrology(total, step)
			
			# 13. Import initialization files
			total = self.import_init(total, step)
			
			# 14. Import land use management files
			total = self.import_lum(total, step)
			
			# 15. Import operations files
			total = self.import_ops(total, step)
			
			# 16. Import recall files
			total = self.import_recall(total, step)
			
			# 17. Import basin files
			total = self.import_basin(total, step)
			
			# 18. Import change/calibration files
			total = self.import_change(total, step)
			
			# 19. Import regions files
			total = self.import_regions(total, step)
			
			# 20. Import structural files
			total = self.import_structural(total, step)
			
			# Update project config
			Project_config.update(
				input_files_last_written=None,
				swat_last_run=None,
				output_last_imported=None
			).execute()
			
			self.emit_progress(100, "Import complete!")
			
		except Exception as err:
			sys.exit("Error during import: {err}".format(err=str(err)))
	
	def get_file_path(self, filename):
		"""Get the full path to a file in the TxtInOut directory."""
		return os.path.join(self.txtinout_dir, filename)
	
	def file_exists(self, filename):
		"""Check if a file exists in the TxtInOut directory."""
		return os.path.exists(self.get_file_path(filename))
	
	def import_simulation(self, start_prog, allocated_prog):
		"""Import simulation configuration files."""
		self.emit_progress(start_prog, "Importing simulation files...")
		
		# Import time.sim if it exists
		if self.file_exists("time.sim"):
			try:
				simulation.Time_sim(self.get_file_path("time.sim"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass  # Read not implemented for this file type
		
		# Import print.prt if it exists
		if self.file_exists("print.prt"):
			try:
				simulation.Print_prt(self.get_file_path("print.prt"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import object.prt if it exists
		if self.file_exists("object.prt"):
			try:
				simulation.Object_prt(self.get_file_path("object.prt"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_climate(self, start_prog, allocated_prog):
		"""Import climate/weather files."""
		self.emit_progress(start_prog, "Importing climate files...")
		
		# Import weather station file
		if self.file_exists("weather-sta.cli"):
			try:
				climate.Weather_sta_cli(self.get_file_path("weather-sta.cli"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import weather generator file
		if self.file_exists("weather-wgn.cli"):
			try:
				climate.Weather_wgn_cli(self.get_file_path("weather-wgn.cli"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_parm_db(self, start_prog, allocated_prog):
		"""Import parameter database files."""
		self.emit_progress(start_prog, "Importing parameter database files...")
		
		# Import plants
		if self.file_exists("plants.plt"):
			try:
				hru_parm_db.Plants_plt(self.get_file_path("plants.plt"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import fertilizers
		if self.file_exists("fertilizer.frt"):
			try:
				hru_parm_db.Fertilizer_frt(self.get_file_path("fertilizer.frt"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import tillage
		if self.file_exists("tillage.til"):
			try:
				hru_parm_db.Tillage_til(self.get_file_path("tillage.til"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import pesticides
		if self.file_exists("pesticide.pst"):
			try:
				hru_parm_db.Pesticide_pst(self.get_file_path("pesticide.pst"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import urban parameters
		if self.file_exists("urban.urb"):
			try:
				hru_parm_db.Urban_urb(self.get_file_path("urban.urb"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import septic parameters
		if self.file_exists("septic.sep"):
			try:
				hru_parm_db.Septic_sep(self.get_file_path("septic.sep"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import snow parameters
		if self.file_exists("snow.sno"):
			try:
				hru_parm_db.Snow_sno(self.get_file_path("snow.sno"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_soils(self, start_prog, allocated_prog):
		"""Import soil files."""
		self.emit_progress(start_prog, "Importing soil files...")
		
		# Import soils_lte.sol if it exists
		if self.file_exists("soils_lte.sol"):
			try:
				soils.Soils_lte_sol(self.get_file_path("soils_lte.sol"), self.editor_version, self.swat_version).read(self.DATABASE_TYPE_PROJECT)
			except NotImplementedError:
				pass
		
		# Import nutrients.sol if it exists
		if self.file_exists("nutrients.sol"):
			try:
				soils.Nutrients_sol(self.get_file_path("nutrients.sol"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_decision_table(self, start_prog, allocated_prog):
		"""Import decision table files."""
		self.emit_progress(start_prog, "Importing decision table files...")
		
		# Import various decision table files
		dtable_files = ['lum.dtl', 'res_rel.dtl', 'scen_lu.dtl', 'flo_con.dtl']
		for dtable_file in dtable_files:
			if self.file_exists(dtable_file):
				try:
					decision_table.D_table_dtl(self.get_file_path(dtable_file), file_type=dtable_file).read()
				except NotImplementedError:
					pass
		
		return start_prog + allocated_prog
	
	def import_connect(self, start_prog, allocated_prog):
		"""Import connection files."""
		self.emit_progress(start_prog, "Importing connection files...")
		
		# Import connection files
		connect_files = {
			'hru.con': connect.Hru_con,
			'hru-lte.con': connect.Hru_lte_con,
			'rout_unit.con': connect.Rout_unit_con,
			'aquifer.con': connect.Aquifer_con,
			'channel.con': connect.Channel_con,
			'reservoir.con': connect.Reservoir_con,
			'recall.con': connect.Recall_con,
			'exco.con': connect.Exco_con,
			'delratio.con': connect.Delratio_con,
			'chandeg.con': connect.Chandeg_con
		}
		
		for filename, file_class in connect_files.items():
			if self.file_exists(filename):
				try:
					file_class(self.get_file_path(filename), self.editor_version, self.swat_version).read()
				except NotImplementedError:
					pass
		
		return start_prog + allocated_prog
	
	def import_channel(self, start_prog, allocated_prog):
		"""Import channel files."""
		self.emit_progress(start_prog, "Importing channel files...")
		
		# Import channel files
		if self.file_exists("channel.cha"):
			try:
				channel.Channel_cha(self.get_file_path("channel.cha"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("channel-lte.cha"):
			try:
				channel.Channel_lte_cha(self.get_file_path("channel-lte.cha"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("hydrology.cha"):
			try:
				channel.Hydrology_cha(self.get_file_path("hydrology.cha"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("sediment.cha"):
			try:
				channel.Sediment_cha(self.get_file_path("sediment.cha"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("nutrients.cha"):
			try:
				channel.Nutrients_cha(self.get_file_path("nutrients.cha"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("initial.cha"):
			try:
				channel.Initial_cha(self.get_file_path("initial.cha"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_reservoir(self, start_prog, allocated_prog):
		"""Import reservoir files."""
		self.emit_progress(start_prog, "Importing reservoir files...")
		
		# Import reservoir files
		if self.file_exists("reservoir.res"):
			try:
				reservoir.Reservoir_res(self.get_file_path("reservoir.res"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("hydrology.res"):
			try:
				reservoir.Hydrology_res(self.get_file_path("hydrology.res"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("initial.res"):
			try:
				reservoir.Initial_res(self.get_file_path("initial.res"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("sediment.res"):
			try:
				reservoir.Sediment_res(self.get_file_path("sediment.res"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("nutrients.res"):
			try:
				reservoir.Nutrients_res(self.get_file_path("nutrients.res"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("wetland.wet"):
			try:
				reservoir.Wetland_wet(self.get_file_path("wetland.wet"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("hydrology.wet"):
			try:
				reservoir.Hydrology_wet(self.get_file_path("hydrology.wet"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_routing_unit(self, start_prog, allocated_prog):
		"""Import routing unit files."""
		self.emit_progress(start_prog, "Importing routing unit files...")
		
		if self.file_exists("rout_unit.rtu"):
			try:
				routing_unit.Rout_unit_rtu(self.get_file_path("rout_unit.rtu"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("rout_unit.ele"):
			try:
				routing_unit.Rout_unit_ele(self.get_file_path("rout_unit.ele"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_aquifer(self, start_prog, allocated_prog):
		"""Import aquifer files."""
		self.emit_progress(start_prog, "Importing aquifer files...")
		
		if self.file_exists("aquifer.aqu"):
			try:
				aquifer.Aquifer_aqu(self.get_file_path("aquifer.aqu"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("initial.aqu"):
			try:
				aquifer.Initial_aqu(self.get_file_path("initial.aqu"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_hru(self, start_prog, allocated_prog):
		"""Import HRU files."""
		self.emit_progress(start_prog, "Importing HRU files...")
		
		if self.file_exists("hru-data.hru"):
			try:
				hru.Hru_data_hru(self.get_file_path("hru-data.hru"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("hru-lte.hru"):
			try:
				hru.Hru_lte_hru(self.get_file_path("hru-lte.hru"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_hydrology(self, start_prog, allocated_prog):
		"""Import hydrology files."""
		self.emit_progress(start_prog, "Importing hydrology files...")
		
		if self.file_exists("hydrology.hyd"):
			try:
				hydrology.Hydrology_hyd(self.get_file_path("hydrology.hyd"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("topography.hyd"):
			try:
				hydrology.Topography_hyd(self.get_file_path("topography.hyd"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("field.fld"):
			try:
				hydrology.Field_fld(self.get_file_path("field.fld"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_init(self, start_prog, allocated_prog):
		"""Import initialization files."""
		self.emit_progress(start_prog, "Importing initialization files...")
		
		# Note: Initialization files currently don't have read() implementations
		# The following list documents which files should be processed here
		# When read() methods are implemented in fileio/init.py, uncomment the loop below
		#
		# init_files = [
		#     'plant.ini', 'soil_plant.ini', 'om_water.ini',
		#     'pest_hru.ini', 'pest_water.ini', 'path_hru.ini',
		#     'path_water.ini', 'hmet_hru.ini', 'hmet_water.ini'
		# ]
		#
		# for init_file in init_files:
		#     if self.file_exists(init_file):
		#         try:
		#             # Call appropriate init file class read() method
		#             pass
		#         except NotImplementedError:
		#             pass
		
		return start_prog + allocated_prog
	
	def import_lum(self, start_prog, allocated_prog):
		"""Import land use management files."""
		self.emit_progress(start_prog, "Importing land use management files...")
		
		if self.file_exists("landuse.lum"):
			try:
				lum.Landuse_lum(self.get_file_path("landuse.lum"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("management.sch"):
			try:
				lum.Management_sch(self.get_file_path("management.sch"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("cntable.lum"):
			try:
				lum.Cntable_lum(self.get_file_path("cntable.lum"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("cons_practice.lum"):
			try:
				lum.Cons_prac_lum(self.get_file_path("cons_practice.lum"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("ovn_table.lum"):
			try:
				lum.Ovn_table_lum(self.get_file_path("ovn_table.lum"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_ops(self, start_prog, allocated_prog):
		"""Import operations files."""
		self.emit_progress(start_prog, "Importing operations files...")
		
		# Note: Operations files currently don't have read() implementations
		# The following list documents which files should be processed here
		# When read() methods are implemented in fileio/ops.py, uncomment the loop below
		#
		# ops_files = [
		#     'harv.ops', 'graze.ops', 'irr.ops',
		#     'sweep.ops', 'fire.ops', 'chem_app.ops'
		# ]
		#
		# for ops_file in ops_files:
		#     if self.file_exists(ops_file):
		#         try:
		#             # Call appropriate ops file class read() method
		#             pass
		#         except NotImplementedError:
		#             pass
		
		return start_prog + allocated_prog
	
	def import_recall(self, start_prog, allocated_prog):
		"""Import recall files."""
		self.emit_progress(start_prog, "Importing recall files...")
		
		if self.file_exists("recall.rec"):
			try:
				recall.Recall_rec(self.get_file_path("recall.rec"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_basin(self, start_prog, allocated_prog):
		"""Import basin files."""
		self.emit_progress(start_prog, "Importing basin files...")
		
		if self.file_exists("codes.bsn"):
			try:
				basin.Codes_bsn(self.get_file_path("codes.bsn"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("parameters.bsn"):
			try:
				basin.Parameters_bsn(self.get_file_path("parameters.bsn"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_change(self, start_prog, allocated_prog):
		"""Import calibration/change files."""
		self.emit_progress(start_prog, "Importing calibration files...")
		
		if self.file_exists("calibration.cal"):
			try:
				change.Calibration_cal(self.get_file_path("calibration.cal"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("cal_parms.cal"):
			try:
				change.Cal_parms_cal(self.get_file_path("cal_parms.cal"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_regions(self, start_prog, allocated_prog):
		"""Import regions files."""
		self.emit_progress(start_prog, "Importing regions files...")
		
		if self.file_exists("ls_unit.def"):
			try:
				regions.Ls_unit_def(self.get_file_path("ls_unit.def"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		if self.file_exists("ls_unit.ele"):
			try:
				regions.Ls_unit_ele(self.get_file_path("ls_unit.ele"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog
	
	def import_structural(self, start_prog, allocated_prog):
		"""Import structural BMP files."""
		self.emit_progress(start_prog, "Importing structural files...")
		
		# Import septic.str if it exists
		if self.file_exists("septic.str"):
			try:
				structural.Septic_str(self.get_file_path("septic.str"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import bmpuser.str if it exists
		if self.file_exists("bmpuser.str"):
			try:
				structural.Bmpuser_str(self.get_file_path("bmpuser.str"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import filterstrip.str if it exists
		if self.file_exists("filterstrip.str"):
			try:
				structural.Filterstrip_str(self.get_file_path("filterstrip.str"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import grassedww.str if it exists
		if self.file_exists("grassedww.str"):
			try:
				structural.Grassedww_str(self.get_file_path("grassedww.str"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		# Import tiledrain.str if it exists
		if self.file_exists("tiledrain.str"):
			try:
				structural.Tiledrain_str(self.get_file_path("tiledrain.str"), self.editor_version, self.swat_version).read()
			except NotImplementedError:
				pass
		
		return start_prog + allocated_prog


if __name__ == '__main__':
	sys.stdout = Unbuffered(sys.stdout)
	parser = argparse.ArgumentParser(description="Import SWAT+ text files from TxtInOut directory to project database")
	parser.add_argument("project_db_file", type=str, help="full path of project SQLite database file")
	parser.add_argument("txtinout_dir", type=str, help="full path of TxtInOut directory containing text files")
	parser.add_argument("--editor_version", type=str, help="editor version", nargs="?", default="3.0.0")
	parser.add_argument("--swat_version", type=str, help="SWAT+ version", nargs="?", default="60.5.4")
	
	args = parser.parse_args()
	
	api = ImportTextFiles(args.project_db_file, args.txtinout_dir, args.editor_version, args.swat_version)
	api.import_files()
