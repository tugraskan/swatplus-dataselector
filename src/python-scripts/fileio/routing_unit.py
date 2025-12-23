from .base import BaseFileModel
from helpers import utils, table_mapper
from database.project import connect, base as project_base, hydrology, dr
from database import lib as db_lib
import database.project.routing_unit as db

from peewee import *


class Rout_unit(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		"""
		Read rout_unit.rtu file and populate Rout_unit_rtu table.
		File format: id, name, define, dlr, topo, field (6 columns)
		Note: 'define' column is same as name, 'id' is ignored
		"""
		file = open(self.file_name, "r")
		
		i = 1
		data = []
		for line in file:
			if i > 2:  # Skip header lines
				val = line.split()
				if len(val) < 6:
					continue
				
				# Look up foreign keys by name
				dlr_name = val[3]
				dlr_id = None
				if dlr_name != 'null':
					try:
						dlr_rec = db.Rout_unit_dr.get(db.Rout_unit_dr.name == dlr_name)
						dlr_id = dlr_rec.id
					except:
						pass
				
				topo_name = val[4]
				topo_id = None
				if topo_name != 'null':
					try:
						topo_rec = hydrology.Topography_hyd.get(hydrology.Topography_hyd.name == topo_name)
						topo_id = topo_rec.id
					except:
						pass
				
				field_name = val[5]
				field_id = None
				if field_name != 'null':
					try:
						field_rec = hydrology.Field_fld.get(hydrology.Field_fld.name == field_name)
						field_id = field_rec.id
					except:
						pass
				
				d = {
					'name': val[1],
					'dlr': dlr_id,
					'topo': topo_id,
					'field': field_id
				}
				data.append(d)
			i += 1
		
		file.close()
		
		if len(data) > 0:
			db_lib.bulk_insert(project_base.db, db.Rout_unit_rtu, data)

	def write(self):
		table = db.Rout_unit_rtu
		order_by = db.Rout_unit_rtu.id

		if table.select().count() > 0:
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				file.write(utils.int_pad("id"))
				file.write(utils.string_pad("name"))
				file.write(utils.string_pad("define"))
				file.write(utils.string_pad("dlr"))
				file.write(utils.string_pad("topo"))
				file.write(utils.string_pad("field"))
				file.write("\n")

				i = 1
				for row in table.select().order_by(order_by):
					file.write(utils.int_pad(i))
					i += 1
					file.write(utils.string_pad(row.name))
					file.write(utils.string_pad(row.name))
					file.write(utils.key_name_pad(row.dlr))
					file.write(utils.key_name_pad(row.topo))
					file.write(utils.key_name_pad(row.field))
					file.write("\n")


class Rout_unit_ele(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		raise NotImplementedError('Reading not implemented yet.')

	def write(self):
		table = connect.Rout_unit_ele
		order_by = connect.Rout_unit_ele.id

		con_out_types = table.select(table.obj_typ).distinct()
		con_out_id_dict = {}
		for out_typ in con_out_types:
			obj_table = table_mapper.obj_typs.get(out_typ.obj_typ, None)
			con_out_id_dict[out_typ.obj_typ] = [o.id for o in obj_table.select(obj_table.id).order_by(obj_table.id)]

		if table.select().count() > 0:
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				file.write(utils.int_pad("id"))
				file.write(utils.string_pad("name", direction="left"))
				file.write(utils.code_pad("obj_typ"))
				file.write(utils.int_pad("obj_id"))
				file.write(utils.num_pad("frac"))
				file.write(utils.string_pad("dlr"))
				file.write("\n")

				i = 1
				for row in table.select().order_by(order_by):
					obj_id = con_out_id_dict[row.obj_typ].index(row.obj_id) + 1
					file.write(utils.int_pad(i))
					i += 1
					file.write(utils.string_pad(row.name, direction="left"))
					file.write(utils.code_pad(row.obj_typ))
					file.write(utils.int_pad(obj_id))
					file.write(utils.exp_pad(row.frac))
					file.write(utils.key_name_pad(row.dlr, text_if_null="0"))
					file.write("\n")


class Rout_unit_dr(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		"""
		Read rout_unit.dr file and populate Rout_unit_dr table.
		File format: name, temp, flo, sed, orgn, sedp, no3, solp, pest_sol, pest_sorb (10 columns)
		"""
		self.read_default_table(db.Rout_unit_dr, project_base.db, 10, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Rout_unit_dr, True)


class Rout_unit_def(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		raise NotImplementedError('Reading not implemented yet.')

	def write(self):
		table = connect.Rout_unit_con
		order_by = connect.Rout_unit_con.id
		count = table.select().count()

		if count > 0:
			element_table = connect.Rout_unit_ele
			first_elem = element_table.get()
			obj_table = table_mapper.obj_typs.get(first_elem.obj_typ, None)
			obj_ids = [o.id for o in obj_table.select(obj_table.id).order_by(obj_table.id)]
			
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				file.write(utils.int_pad("id"))
				file.write(utils.string_pad("name"))
				file.write(utils.int_pad("elem_tot"))
				file.write(utils.int_pad("elements"))
				file.write("\n")

				i = 1
				for row in table.select().order_by(order_by):
					file.write(utils.int_pad(i))
					i += 1
					file.write(utils.string_pad(row.name))

					self.write_ele_ids2(file, table, element_table, row.elements, obj_table, obj_ids)
					file.write("\n")


# Backwards-compatible aliases expected by import code
Rout_unit_rtu = Rout_unit
