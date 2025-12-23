from .base import BaseFileModel
from database.project import base as project_base
from database.project import hru_parm_db as project_parmdb
from database.datasets import base as datasets_base
from database.datasets import hru_parm_db as datasets_parmdb
from database import lib as db_lib

from helpers import utils
import database.project.hru_parm_db as db


class Plants_plt(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project', csv=False):
		if database == 'project':
			self.read_default_table(project_parmdb.Plants_plt, project_base.db, 53, ignore_id_col=True, csv=csv)
		else:
			self.read_default_table(datasets_parmdb.Plants_plt, datasets_base.db, 53, ignore_id_col=True, csv=csv)

	def write(self, database='project', csv=False):
		if database == 'project':
			table = project_parmdb.Plants_plt
		else:
			table = datasets_parmdb.Plants_plt

		if csv:
			self.write_default_csv(table, True)
		else:
			self.write_default_table(table, True)


class Fertilizer_frt(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database ='project'):
		if database == 'project':
			self.read_default_table(project_parmdb.Fertilizer_frt, project_base.db, 0, ignore_id_col=True)
		else:
			self.read_default_table(datasets_parmdb.Fertilizer_frt, datasets_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Fertilizer_frt, True)


class Tillage_til(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database ='project'):
		if database == 'project':
			self.read_default_table(project_parmdb.Tillage_til, project_base.db, 0, ignore_id_col=True)
		else:
			self.read_default_table(datasets_parmdb.Tillage_til, datasets_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Tillage_til, True)


class Pesticide_pst(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database ='project'):
		if database == 'project':
			self.read_default_table(project_parmdb.Pesticide_pst, project_base.db, 0, ignore_id_col=True)
		else:
			self.read_default_table(datasets_parmdb.Pesticide_pst, datasets_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Pesticide_pst, True)


class Urban_urb(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database ='project'):
		if database == 'project':
			self.read_default_table(project_parmdb.Urban_urb, project_base.db, 0, ignore_id_col=True)
		else:
			self.read_default_table(datasets_parmdb.Urban_urb, datasets_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Urban_urb, True)


class Septic_sep(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database ='project'):
		"""
		Read a septic.sep text file into the database.
		NOTE: CURRENTLY THERE IS AN EXTRA NUMERIC COLUMN BEFORE THE DESCRIPTION.
		:param database: project or datasets
		:return:
		"""
		file = open(self.file_name, "r")

		i = 1
		septics = []
		for line in file:
			if i > 2:
				val = line.split()
				# Accept files with either 11 columns (no extra numeric + no description)
				# or 13 columns (extra numeric before description). Require at least 11 cols.
				self.check_cols(val, 11, 'septic')

				# Map fixed fields (first 11 columns)
				sep = {
					'name': val[0].lower(),
					'q_rate': val[1],
					'bod': val[2],
					'tss': val[3],
					'nh4_n': val[4],
					'no3_n': val[5],
					'no2_n': val[6],
					'org_n': val[7],
					'min_p': val[8],
					'org_p': val[9],
					'fcoli': val[10],
					# If a description column exists (column 12 in 13-col format), use the last column as description.
					'description': (val[-1] if len(val) > 11 and val[-1] != 'null' else None)
				}
				septics.append(sep)
			i += 1

		if database == 'project':
			db_lib.bulk_insert(project_base.db, project_parmdb.Septic_sep, septics)
		else:
			db_lib.bulk_insert(datasets_base.db, datasets_parmdb.Septic_sep, septics)

	def write(self):
		self.write_default_table(db.Septic_sep, True)


class Snow_sno(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		"""
		Read `snow.sno` into the database. Some datasets may omit the final
		snow_init column; to avoid NOT NULL constraint failures we pad missing
		columns with 0.0 (safe default).
		"""
		file = open(self.file_name, 'r')

		i = 1
		rows = []
		for line in file:
			if i > 2:
				val = line.split()
				# Expecting 9 columns: name + 8 numeric values. Pad missing with '0'.
				if len(val) < 9:
					val = val + ['0'] * (9 - len(val))

				row = {
					'name': val[0].lower(),
					'fall_tmp': val[1],
					'melt_tmp': val[2],
					'melt_max': val[3],
					'melt_min': val[4],
					'tmp_lag': val[5],
					'snow_h2o': val[6],
					'cov50': val[7],
					# Use provided value or 0.0 default when missing/null
					'snow_init': (val[8] if val[8] != 'null' else 0)
				}
				rows.append(row)
			i += 1

		if database == 'project':
			db_lib.bulk_insert(project_base.db, project_parmdb.Snow_sno, rows)
		else:
			db_lib.bulk_insert(datasets_base.db, datasets_parmdb.Snow_sno, rows)

	def write(self):
		self.write_default_table(db.Snow_sno, True)
		
		
class Pathogens_pth(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database ='project'):
		if database == 'project':
			self.read_default_table(project_parmdb.Pathogens_pth, project_base.db, 0, ignore_id_col=True)
		else:
			self.read_default_table(datasets_parmdb.Pathogens_pth, datasets_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Pathogens_pth, True)
