from helpers import utils, table_mapper
import database.project.connect as db

from database.project import hru, routing_unit, exco, reservoir, aquifer, channel, recall, dr, basin, climate, simulation
from database import lib as db_lib
from database.project import base as project_base
from .base import BaseFileModel


def read_con_table(file_name, con_table, con_out_table, elem_name, elem_table):
	"""
	Read a connection file and populate the connection and connection outflow tables.
	:param file_name: Path to the connection file
	:param con_table: Database table for connections (e.g., db.Aquifer_con)
	:param con_out_table: Database table for connection outflows (e.g., db.Aquifer_con_out)
	:param elem_name: Name of the element field (e.g., "aqu", "cha", "res")
	:param elem_table: Database table for the element (e.g., aquifer.Aquifer_aqu)
	"""
	file = open(file_name, "r")
	
	i = 1
	con_data = []
	con_out_data = []
	
	for line in file:
		if i > 2:  # Skip header lines
			val = line.split()
			if len(val) < 13:  # Minimum columns before con_outs
				continue
			
			# Parse main connection fields
			# id, name, gis_id, area, lat, lon, elev, elem_id, wst, cst, ovfl, rule, out_tot
			con_id = int(val[0])
			name = val[1]
			gis_id = int(val[2]) if val[2] != 'null' else None
			area = float(val[3])
			lat = float(val[4])
			lon = float(val[5])
			elev = float(val[6]) if val[6] != 'null' else None
			elem_id = int(val[7])
			wst_name = val[8] if val[8] != 'null' else None
			cst_id = int(val[9]) if val[9] != 'null' else 0
			ovfl = int(val[10])
			rule = int(val[11])
			out_tot = int(val[12])
			
			# Look up foreign keys
			wst_id = None
			if wst_name is not None:
				try:
					wst = climate.Weather_sta_cli.get(climate.Weather_sta_cli.name == wst_name)
					wst_id = wst.id
				except:
					pass  # Weather station not found, leave as None
			
			# Look up element ID
			elem_fk_id = None
			try:
				elem = elem_table.get(elem_table.id == elem_id)
				elem_fk_id = elem.id
			except:
				pass  # Element not found, leave as None
			
			# Build connection record
			con_record = {
				'name': name,
				'gis_id': gis_id,
				'area': area,
				'lat': lat,
				'lon': lon,
				'elev': elev,
				'wst': wst_id,
				'cst': cst_id if cst_id > 0 else None,
				'ovfl': ovfl,
				'rule': rule
			}
			
			# Add element-specific foreign key
			if elem_name == "hru":
				con_record['hru'] = elem_fk_id
			elif elem_name == "rtu":
				con_record['rtu'] = elem_fk_id
			elif elem_name == "aqu":
				con_record['aqu'] = elem_fk_id
			elif elem_name == "cha":
				con_record['cha'] = elem_fk_id
			elif elem_name == "res":
				con_record['res'] = elem_fk_id
			elif elem_name == "rec":
				con_record['rec'] = elem_fk_id
			elif elem_name == "exco":
				con_record['exco'] = elem_fk_id
			elif elem_name == "dlr":
				con_record['dlr'] = elem_fk_id
			elif elem_name == "lcha":
				con_record['lcha'] = elem_fk_id
			elif elem_name == "lhru":
				con_record['lhru'] = elem_fk_id
			
			con_data.append(con_record)
			
			# Parse connection outflow records (groups of 4 values: obj_typ, obj_id, hyd_typ, frac)
			out_idx = 13
			for j in range(out_tot):
				if out_idx + 3 < len(val):
					obj_typ = val[out_idx]
					obj_id = int(val[out_idx + 1])
					hyd_typ = val[out_idx + 2]
					frac = float(val[out_idx + 3])
					
					con_out_record = {
						'order': j + 1,
						'obj_typ': obj_typ,
						'obj_id': obj_id,
						'hyd_typ': hyd_typ,
						'frac': frac
					}
					con_out_data.append((con_id, con_out_record))
					out_idx += 4
		
		i += 1
	
	file.close()
	
	# Insert connection records
	if len(con_data) > 0:
		db_lib.bulk_insert(project_base.db, con_table, con_data)
	
	# Insert connection outflow records
	# We need to map the file's con_id to the actual database ID
	if len(con_out_data) > 0:
		# Get mapping of names to database IDs
		con_records = con_table.select()
		name_to_db_id = {c.name: c.id for c in con_records}
		
		# Build con_out records with correct foreign keys
		con_out_final = []
		for file_con_id, out_record in con_out_data:
			# Find the connection name from con_data
			if file_con_id - 1 < len(con_data):
				con_name = con_data[file_con_id - 1]['name']
				if con_name in name_to_db_id:
					out_record_with_fk = out_record.copy()
					# Add the appropriate foreign key field based on table
					if con_out_table == db.Aquifer_con_out:
						out_record_with_fk['aquifer_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Channel_con_out:
						out_record_with_fk['channel_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Reservoir_con_out:
						out_record_with_fk['reservoir_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Hru_con_out:
						out_record_with_fk['hru_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Hru_lte_con_out:
						out_record_with_fk['hru_lte_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Rout_unit_con_out:
						out_record_with_fk['rtu_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Recall_con_out:
						out_record_with_fk['recall_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Exco_con_out:
						out_record_with_fk['exco_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Delratio_con_out:
						out_record_with_fk['delratio_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Chandeg_con_out:
						out_record_with_fk['chandeg_con'] = name_to_db_id[con_name]
					elif con_out_table == db.Outlet_con_out:
						out_record_with_fk['outlet_con'] = name_to_db_id[con_name]
					
					con_out_final.append(out_record_with_fk)
		
		if len(con_out_final) > 0:
			db_lib.bulk_insert(project_base.db, con_out_table, con_out_final)


def write_header(file, elem_name, has_con_out):
	file.write(utils.int_pad("id"))
	file.write(utils.string_pad("name", direction="left"))
	file.write(utils.int_pad("gis_id"))
	file.write(utils.num_pad("area"))
	file.write(utils.num_pad("lat"))
	file.write(utils.num_pad("lon"))
	file.write(utils.num_pad("elev"))
	file.write(utils.int_pad(elem_name))
	file.write(utils.string_pad("wst"))
	file.write(utils.int_pad("cst"))
	file.write(utils.int_pad("ovfl"))
	file.write(utils.int_pad("rule"))
	file.write(utils.int_pad("out_tot"))

	if has_con_out:
		file.write(utils.code_pad("obj_typ"))
		file.write(utils.int_pad("obj_id"))
		file.write(utils.code_pad("hyd_typ"))
		file.write(utils.num_pad("frac"))

	file.write("\n")


def write_row(file, con, index, con_to_index, con_outs, con_out_id_dict, using_gwflow=False):
	file.write(utils.int_pad(index))
	file.write(utils.string_pad(con.name, direction="left"))
	file.write(utils.int_pad(con.gis_id))
	file.write(utils.num_pad(con.area, use_non_zero_min=True))
	file.write(utils.num_pad(con.lat))
	file.write(utils.num_pad(con.lon))
	file.write(utils.num_pad(con.elev))
	file.write(utils.int_pad(con_to_index))
	file.write(utils.string_pad("null" if con.wst is None else con.wst.name))
	file.write(utils.int_pad(con.cst_id))
	file.write(utils.int_pad(con.ovfl))
	file.write(utils.int_pad(con.rule))

	total = con_outs.count()
	hyd_typs = [v.hyd_typ for v in con_outs]
	has_rhg = "rhg" in hyd_typs
	if using_gwflow and has_rhg:
		total = total - 1
	file.write(utils.int_pad(total))

	for out in con_outs:
		obj_id = out.obj_id

		elem_table = table_mapper.obj_typs.get(out.obj_typ, None)
		if elem_table is not None:
			obj_id = con_out_id_dict[out.obj_typ].index(out.obj_id) + 1
			#obj_id = elem_table.select().where(elem_table.id <= out.obj_id).count()

		file.write(utils.code_pad(out.obj_typ))
		file.write(utils.int_pad(obj_id))
		file.write(utils.code_pad(out.hyd_typ))
		file.write(utils.num_pad(out.frac))

	file.write("\n")


def write_con_table(file_name, meta_line, con_table, con_out_table, elem_name, elem_table, using_gwflow=False):
	if con_table.select().count() > 0:
		with open(file_name, 'w') as file:
			file.write(meta_line)
			write_header(file, elem_name, con_out_table.select().count() > 0)

			con_out_types = con_out_table.select(con_out_table.obj_typ).distinct()
			con_out_id_dict = {}
			for out_typ in con_out_types:
				obj_table = table_mapper.obj_typs.get(out_typ.obj_typ, None)
				con_out_id_dict[out_typ.obj_typ] = [o.id for o in obj_table.select(obj_table.id).order_by(obj_table.id)]

			elem_ids = [o.id for o in elem_table.select(elem_table.id).order_by(elem_table.id)]

			i = 1
			for con in con_table.select().order_by(con_table.id):
				elem_id = 1

				if elem_name == "hru":
					elem_id = con.hru_id
				elif elem_name == "rtu":
					elem_id = con.rtu_id
				elif elem_name == "aqu":
					elem_id = con.aqu_id
				elif elem_name == "cha":
					elem_id = con.cha_id
				elif elem_name == "res":
					elem_id = con.res_id
				elif elem_name == "rec":
					elem_id = con.rec_id
				elif elem_name == "exco":
					elem_id = con.exco_id
				elif elem_name == "lcha":
					elem_id = con.lcha_id
				elif elem_name == "lhru":
					elem_id = con.lhru_id

				con_to_index = elem_ids.index(elem_id) + 1
				#con_to_index = elem_id
				#if con.id != elem_id:
					#con_to_index = elem_ids.index(elem_id) + 1
					#con_to_index = elem_table.select().where(elem_table.id <= elem_id).count()
				write_row(file, con, i, con_to_index, con.con_outs.order_by(con_out_table.order), con_out_id_dict, using_gwflow)
				i += 1


class IndexHelper():
	def __init__(self, con_table):
		self.con_table = con_table

	def get(self):
		cons = self.con_table.select().order_by(self.con_table.id)
		gis_to_con = {}
		i = 1
		for con in cons:
			gis_to_con[con.gis_id] = i
			i += 1
		return gis_to_con
	
	def get_names(self):
		cons = self.con_table.select().order_by(self.con_table.id)
		gis_to_con = {}
		for con in cons:
			gis_to_con[con.gis_id] = con.name
		return gis_to_con
	
	def get_id_from_name(self):
		cons = self.con_table.select().order_by(self.con_table.id)
		con_to_gis = {}
		for con in cons:
			con_to_gis[con.name] = con.gis_id
		return con_to_gis


class Hru_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Hru_con, db.Hru_con_out, "hru", hru.Hru_data_hru)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Hru_con, db.Hru_con_out, "hru", hru.Hru_data_hru)


class Hru_lte_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Hru_lte_con, db.Hru_lte_con_out, "lhru", hru.Hru_lte_hru)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Hru_lte_con, db.Hru_lte_con_out, "lhru", hru.Hru_lte_hru)


class Rout_unit_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Rout_unit_con, db.Rout_unit_con_out, "rtu", routing_unit.Rout_unit_rtu)

	def write(self):
		using_gwflow = False
		codes_bsn = basin.Codes_bsn.get_or_none()
		if codes_bsn is not None:
			using_gwflow = codes_bsn.gwflow == 1
		write_con_table(self.file_name, self.get_meta_line(), db.Rout_unit_con, db.Rout_unit_con_out, "rtu", routing_unit.Rout_unit_rtu, using_gwflow)


class Aquifer_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Aquifer_con, db.Aquifer_con_out, "aqu", aquifer.Aquifer_aqu)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Aquifer_con, db.Aquifer_con_out, "aqu", aquifer.Aquifer_aqu)


class Channel_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Channel_con, db.Channel_con_out, "cha", channel.Channel_cha)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Channel_con, db.Channel_con_out, "cha", channel.Channel_cha)


class Chandeg_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Chandeg_con, db.Chandeg_con_out, "lcha", channel.Channel_lte_cha)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Chandeg_con, db.Chandeg_con_out, "lcha", channel.Channel_lte_cha)


class Reservoir_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Reservoir_con, db.Reservoir_con_out, "res", reservoir.Reservoir_res)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Reservoir_con, db.Reservoir_con_out, "res", reservoir.Reservoir_res)


class Recall_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Recall_con, db.Recall_con_out, "rec", recall.Recall_rec)

	def write(self):
		#write_con_table(self.file_name, self.get_meta_line(), db.Recall_con, db.Recall_con_out, "rec", recall.Recall_rec)
		con_table = db.Recall_con
		con_out_table = db.Recall_con_out
		elem_table = recall.Recall_rec
		data = con_table.select(con_table, elem_table).join(elem_table).where(elem_table.rec_typ != 4)
		elem_data = elem_table.select(elem_table.id).where(elem_table.rec_typ != 4).order_by(elem_table.id)

		if data.count() > 0:
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				write_header(file, "rec", con_out_table.select().count() > 0)

				con_out_types = con_out_table.select(con_out_table.obj_typ).distinct()
				con_out_id_dict = {}
				for out_typ in con_out_types:
					obj_table = table_mapper.obj_typs.get(out_typ.obj_typ, None)
					con_out_id_dict[out_typ.obj_typ] = [o.id for o in obj_table.select(obj_table.id).order_by(obj_table.id)]

				elem_ids = [o.id for o in elem_data]

				i = 1
				for con in data.order_by(con_table.id):
					elem_id = con.rec_id
					con_to_index = elem_ids.index(elem_id) + 1
					write_row(file, con, i, con_to_index, con.con_outs.order_by(con_out_table.order), con_out_id_dict)
					i += 1


class Exco_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Recall_con, db.Recall_con_out, "exco", exco.Exco_exc)

	def write(self):
		#write_con_table(self.file_name, self.get_meta_line(), db.Exco_con, db.Exco_con_out, "exco", exco.Exco_exc)
		con_table = db.Recall_con
		con_out_table = db.Recall_con_out
		elem_table = recall.Recall_rec
		data_table = recall.Recall_dat
		#data = con_table.select(con_table, elem_table, data_table).join(elem_table).join(data_table).where((elem_table.rec_typ == 4) & (data_table.flo != 0))

		valid_recs = data_table.select(data_table.recall_rec_id).join(elem_table).where((elem_table.rec_typ == 4) & (data_table.flo != 0))
		valid_ids = [r.recall_rec_id for r in valid_recs]
		data = con_table.select(con_table, elem_table).join(elem_table).where(elem_table.id.in_(valid_ids))
		elem_data = elem_table.select(elem_table.id).where(elem_table.id.in_(valid_ids)).order_by(elem_table.id)

		if data.count() > 0:
			with open(self.file_name, 'w') as file:
				file.write(self.get_meta_line())
				write_header(file, "exco", con_out_table.select().count() > 0)

				con_out_types = con_out_table.select(con_out_table.obj_typ).distinct()
				con_out_id_dict = {}
				for out_typ in con_out_types:
					obj_table = table_mapper.obj_typs.get(out_typ.obj_typ, None)
					con_out_id_dict[out_typ.obj_typ] = [o.id for o in obj_table.select(obj_table.id).order_by(obj_table.id)]

				elem_ids = [o.id for o in elem_data]

				i = 1
				for con in data.order_by(con_table.id):
					elem_id = con.rec_id
					con_to_index = elem_ids.index(elem_id) + 1
					write_row(file, con, i, con_to_index, con.con_outs.order_by(con_out_table.order), con_out_id_dict)
					i += 1


class Delratio_con(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		read_con_table(self.file_name, db.Delratio_con, db.Delratio_con_out, "dlr", dr.Delratio_del)

	def write(self):
		write_con_table(self.file_name, self.get_meta_line(), db.Delratio_con, db.Delratio_con_out, "dlr", dr.Delratio_del)
