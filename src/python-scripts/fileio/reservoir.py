from .base import BaseFileModel, FileColumn as col
from peewee import *
from helpers import utils
from database.project import init, base as project_base
from database import lib as db_lib
import database.project.reservoir as db
from database.project.salts import Salt_res_ini, Salt_module


class Reservoir_res(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		"""
		Read reservoir.res file and populate Reservoir_res table.
		File format: id, name, init, hyd, rel, sed, nut (7 columns)
		"""
		file = open(self.file_name, "r")
		
		i = 1
		data = []
		for line in file:
			if i > 2:  # Skip header lines
				val = line.split()
				if len(val) < 7:
					continue
				
				# Look up foreign keys by name
				def lookup_fk(table, name_val):
					if name_val == 'null':
						return None
					try:
						rec = table.get(table.name == name_val)
						return rec.id
					except:
						return None
				
				d = {
					'name': val[1],
					'init': lookup_fk(db.Initial_res, val[2]),
					'hyd': lookup_fk(db.Hydrology_res, val[3]),
					'rel': None,  # rel field - skip for now
					'sed': lookup_fk(db.Sediment_res, val[5]),
					'nut': lookup_fk(db.Nutrients_res, val[6])
				}
				data.append(d)
			i += 1
		
		file.close()
		
		if len(data) > 0:
			db_lib.bulk_insert(project_base.db, db.Reservoir_res, data)

	def write(self):
		table = db.Reservoir_res
		order_by = db.Reservoir_res.id

		if table.select().count() > 0:
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				file.write(utils.int_pad("id"))
				file.write(utils.string_pad("name", direction="left"))
				file.write(utils.string_pad("init"))
				file.write(utils.string_pad("hyd"))
				file.write(utils.string_pad("rel"))
				file.write(utils.string_pad("sed"))
				file.write(utils.string_pad("nut"))
				file.write("\n")

				i = 1
				for row in table.select().order_by(order_by):
					file.write(utils.int_pad(i))
					i += 1
					file.write(utils.string_pad(row.name, direction="left"))
					file.write(utils.key_name_pad(row.init, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.hyd, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.rel, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.sed, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.nut, default_pad=utils.DEFAULT_STR_PAD))
					file.write("\n")
			
			module, created = Salt_module.get_or_create(id=1)
			if module.enabled:
				self.file_name = self.file_name + "_cs"
				with open(self.file_name, 'w') as file:
					file.write(self.get_meta_line())
					file.write(utils.int_pad("id"))
					file.write(utils.string_pad("pst"))
					file.write(utils.string_pad("weir"))
					file.write(utils.string_pad("salt"))
					file.write(utils.string_pad("cs"))
					file.write("\n")

					i = 1
					for row in table.select().order_by(order_by):
						file.write(utils.int_pad(i))
						i += 1
						file.write(utils.string_pad("null", direction="left"))
						file.write(utils.string_pad("null", direction="left"))
						file.write(utils.key_name_pad(row.init.salt_cs, default_pad=utils.DEFAULT_STR_PAD))
						file.write(utils.string_pad("null", direction="left"))
						file.write("\n")


class Hydrology_res(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		"""
		Read hydrology.res file and populate Hydrology_res table.
		"""
		self.read_default_table(db.Hydrology_res, project_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Hydrology_res, True)


class Initial_res(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		"""
		Read initial.res file and populate Initial_res table.
		File format: name, org_min, pest, path, hmet, description (6 columns)
		"""
		file = open(self.file_name, "r")
		
		i = 1
		data = []
		for line in file:
			if i > 2:  # Skip header lines
				val = line.split()
				if len(val) < 2:
					continue
				
				# Look up Om_water_ini foreign key by name
				org_min_name = val[1] if len(val) > 1 else None
				org_min_id = None
				if org_min_name and org_min_name != 'null':
					try:
						org_min_rec = init.Om_water_ini.get(init.Om_water_ini.name == org_min_name)
						org_min_id = org_min_rec.id
					except:
						pass
				
				description = val[-1] if len(val) > 5 and val[-1] != 'null' else None
				
				d = {
					'name': val[0],
					'org_min': org_min_id,
					'pest': None,
					'path': None,
					'hmet': None,
					'description': description
				}
				data.append(d)
			i += 1
		
		file.close()
		
		if len(data) > 0:
			db_lib.bulk_insert(project_base.db, db.Initial_res, data)

	def write(self):
		table = db.Initial_res
		query = (table.select(table.name,
							  init.Om_water_ini.name.alias("org_min"),
							  init.Pest_water_ini.name.alias("pest"),
							  init.Path_water_ini.name.alias("path"),
							  init.Hmet_water_ini.name.alias("hmet"),
							  table.description)
					  .join(init.Om_water_ini, JOIN.LEFT_OUTER)
					  .switch(table)
					  .join(init.Pest_water_ini, JOIN.LEFT_OUTER)
					  .switch(table)
					  .join(init.Path_water_ini, JOIN.LEFT_OUTER)
					  .switch(table)
					  .join(init.Hmet_water_ini, JOIN.LEFT_OUTER)
					  .order_by(table.id))

		cols = [col(table.name, direction="left"),
				col(table.org_min, query_alias="org_min"),
				col(table.pest, query_alias="pest"),
				col(table.path, query_alias="path"),
				col(table.hmet, query_alias="hmet"),
				col("salt", not_in_db=True, value_override="null"),
				col(table.description, direction="left")]
		self.write_query(query, cols)


class Sediment_res(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		"""
		Read sediment.res file and populate Sediment_res table.
		"""
		self.read_default_table(db.Sediment_res, project_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Sediment_res, True)


class Nutrients_res(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		"""
		Read nutrients.res file and populate Nutrients_res table.
		"""
		self.read_default_table(db.Nutrients_res, project_base.db, 0, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Nutrients_res, True)


class Weir_res(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		raise NotImplementedError('Reading not implemented yet.')

	def write(self):
		self.write_default_table(db.Weir_res, True)


class Wetland_wet(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		"""
		Read wetland.wet file and populate Wetland_wet table.
		"""
		self.read_default_table(db.Wetland_wet, project_base.db, 0, ignore_id_col=False)

	def write(self):
		table = db.Wetland_wet
		order_by = db.Wetland_wet.id

		if table.select().count() > 0:
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				file.write(utils.int_pad("id"))
				file.write(utils.string_pad("name", direction="left"))
				file.write(utils.string_pad("init"))
				file.write(utils.string_pad("hyd"))
				file.write(utils.string_pad("rel"))
				file.write(utils.string_pad("sed"))
				file.write(utils.string_pad("nut"))
				file.write("\n")

				for row in table.select().order_by(order_by):
					file.write(utils.int_pad(row.id))
					file.write(utils.string_pad(row.name, direction="left"))
					file.write(utils.key_name_pad(row.init, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.hyd, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.rel, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.sed, default_pad=utils.DEFAULT_STR_PAD))
					file.write(utils.key_name_pad(row.nut, default_pad=utils.DEFAULT_STR_PAD))
					file.write("\n")
			
			module, created = Salt_module.get_or_create(id=1)
			if module.enabled:
				self.file_name = self.file_name + "_cs"
				with open(self.file_name, 'w') as file:
					file.write(self.get_meta_line())
					file.write(utils.int_pad("id"))
					file.write(utils.string_pad("pst"))
					file.write(utils.string_pad("weir"))
					file.write(utils.string_pad("salt"))
					file.write(utils.string_pad("cs"))
					file.write("\n")

					for row in table.select().order_by(order_by):
						file.write(utils.int_pad(row.id))
						file.write(utils.string_pad("null", direction="left"))
						file.write(utils.string_pad("null", direction="left"))
						file.write(utils.key_name_pad(row.init.salt_cs, default_pad=utils.DEFAULT_STR_PAD))
						file.write(utils.string_pad("null", direction="left"))
						file.write("\n")


class Hydrology_wet(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		raise NotImplementedError('Reading not implemented yet.')

	def write(self):
		self.write_default_table(db.Hydrology_wet, True)
