from .base import BaseFileModel, FileColumn as col
from peewee import *
from helpers import utils
import database.project.soils as db
import database.datasets.soils as db_ds
from database.project import base as project_base
from database.datasets import base as datasets_base


class Nutrients_sol(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		self.read_default_table(db.Nutrients_sol, project_base.db, 4, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Nutrients_sol, ignore_id_col=True, non_zero_min_cols=['exp_co'])


class Soils_sol(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self):
		# Read soils.sol file with nested soil layer format
		# Format: soil header line followed by layer lines
		file = open(self.file_name, "r")
		i = 1
		for line in file:
			if i > 3:  # Skip header lines
				val = line.split()
				if len(val) > 6:  # Soil header line (name, nly, hyd_grp, dp_tot, anion_excl, perc_crk, texture)
					# Insert soil record
					soil = db.Soils_sol.create(
						name=val[0],
						hyd_grp=val[2],
						dp_tot=utils.num_or_null(val[3]),
						anion_excl=utils.num_or_null(val[4]),
						perc_crk=utils.num_or_null(val[5]),
						texture=val[6] if len(val) > 6 else None
					)
					
					# Read layer lines
					nly = int(val[1])
					for layer_num in range(1, nly + 1):
						layer_line = file.readline()
						layer_val = layer_line.split()
						if len(layer_val) >= 14:  # Layer format: dp, bd, awc, soil_k, carbon, clay, silt, sand, rock, alb, usle_k, ec, caco3, ph
							db.Soils_sol_layer.create(
								soil=soil,
								layer_num=layer_num,
								dp=utils.num_or_null(layer_val[0]),
								bd=utils.num_or_null(layer_val[1]),
								awc=utils.num_or_null(layer_val[2]),
								soil_k=utils.num_or_null(layer_val[3]),
								carbon=utils.num_or_null(layer_val[4]),
								clay=utils.num_or_null(layer_val[5]),
								silt=utils.num_or_null(layer_val[6]),
								sand=utils.num_or_null(layer_val[7]),
								rock=utils.num_or_null(layer_val[8]),
								alb=utils.num_or_null(layer_val[9]),
								usle_k=utils.num_or_null(layer_val[10]),
								ec=utils.num_or_null(layer_val[11]),
								caco3=utils.num_or_null(layer_val[12]),
								ph=utils.num_or_null(layer_val[13])
							)
						i += 1
			i += 1
		file.close()

	def write(self):
		soils = db.Soils_sol.select().order_by(db.Soils_sol.id)
		layers = db.Soils_sol_layer.select().order_by(db.Soils_sol_layer.layer_num)
		query = prefetch(soils, layers)

		if soils.count() > 0:
			with open(self.file_name, 'w') as file:
				self.write_meta_line(file)
				header_cols = [col(db.Soils_sol.name, direction="left", padding_override=25),
							   col("nly", not_in_db=True, padding_override=utils.DEFAULT_INT_PAD),
							   col(db.Soils_sol.hyd_grp),
							   col(db.Soils_sol.dp_tot),
							   col(db.Soils_sol.anion_excl),
							   col(db.Soils_sol.perc_crk),
							   col(db.Soils_sol.texture, direction="left", padding_override=25)]
				self.write_headers(file, header_cols)

				total_pad = 122

				lt = db.Soils_sol_layer
				layer_cols = [col(lt.dp),
							  col(lt.bd),
							  col(lt.awc),
							  col(lt.soil_k),
							  col(lt.carbon),
							  col(lt.clay),
							  col(lt.silt),
							  col(lt.sand),
							  col(lt.rock),
							  col(lt.alb),
							  col(lt.usle_k),
							  col(lt.ec),
							  col(lt.caco3),
							  col(lt.ph)]
				self.write_headers(file, layer_cols)

				file.write("\n")

				for row in query:
					row_cols = [col(row.name, direction="left", padding_override=25),
								col(len(row.layers)),
								col(row.hyd_grp),
								col(row.dp_tot),
								col(row.anion_excl),
								col(row.perc_crk),
								col(row.texture, direction="left", padding_override=25)]
					self.write_row(file, row_cols)
					file.write("\n")

					for layer in row.layers:
						layer_row_cols = [col(" ", padding_override=total_pad),
										  col(layer.dp, text_if_null="0.0"),
										  col(layer.bd, text_if_null="0.0"),
										  col(layer.awc, text_if_null="0.0"),
										  col(layer.soil_k, text_if_null="0.0"),
										  col(layer.carbon, text_if_null="0.0"),
										  col(layer.clay, text_if_null="0.0"),
										  col(layer.silt, text_if_null="0.0"),
										  col(layer.sand, text_if_null="0.0"),
										  col(layer.rock, text_if_null="0.0"),
										  col(layer.alb, text_if_null="0.0"),
										  col(layer.usle_k, text_if_null="0.0"),
										  col(layer.ec, text_if_null="0.0"),
										  col(layer.caco3, text_if_null="0.0"),
										  col(layer.ph, text_if_null="0.0")]
						self.write_row(file, layer_row_cols)
						file.write("\n")


class Soils_lte_sol(BaseFileModel):
	def __init__(self, file_name, version=None, swat_version=None):
		self.file_name = file_name
		self.version = version
		self.swat_version = swat_version

	def read(self, database='project'):
		if database == 'project':
			self.read_default_table(db.Soils_lte_sol, project_base.db, 4, ignore_id_col=True)
		else:
			self.read_default_table(db_ds.Soils_lte_sol, datasets_base.db, 4, ignore_id_col=True)

	def write(self):
		self.write_default_table(db.Soils_lte_sol, ignore_id_col=True)
