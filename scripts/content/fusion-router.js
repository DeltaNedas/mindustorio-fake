/*
	Copyright (c) DeltaNedas 2020

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* Passback-less router with a cool design.
   Blendbits are 3 least significant nibbles, edges, outer corners and inner corners.
   The fourth nibble is unused. */

var fusion, liquid;

const ReoucterGraph = {
	new(entity) {
		const ret = Object.create(ReoucterGraph);
		ret.routers = ObjectSet.with(entity);
		// Linked list nodes
		ret.rebuild(entity);
		ret.rebuildOutputs();
		return ret;
	},

	addReoucter(reoucter) {
		const routers = reoucter.routers.asArray();
		for (var i = 0; i < routers.size; i++) {
			this.routers.add(routers.get(i));
			routers.get(i).reoucter = this;
		}
	},

	refresh() {
		const routers = this.routers.asArray();
		for (var i = 0; i < routers.size; i++) {
			var ent = routers.get(i);
			if (ent.block == fusion) {
				ent.reoucter = null;
			}
		}

		ent = this.routers.first();
		this.routers.clear();
		this.rebuild(ent);
		this.rebuildOutputs();
	},

	rebuild(root) {
		for (var i in dirs) {
			var tile = root.tile.getNearby(i);
			if (!tile) return;

			if (tile.block() == fusion) {
				var ent = tile.bc();
				if (this.routers.add(ent)) {
					if (ent.reoucter) {
						if (ent.reoucter == this) return;
						this.addReoucter(ent.reoucter);
					}
					ent.reoucter = this;
					this.rebuild(ent);
				}
			}
		}
	},

	rebuildOutputs() {
		const routers = this.routers.asArray();

		var last;
		for (var i = 0; i < routers.size; i++) {
			var router = routers.get(i);
			for (var o in router.outputs) {
				var node = {
					to: router.outputs[o],
					from: router,
					prev: node
				};

				if (last) {
					last.next = node;
				} else {
					this.last = this.begin = node;
				}
				last = node;
			}
		}
		if (!node) return;

		this.end = node;
		this.end.next = this.begin;
		this.begin.prev = node;
	},

	begin: null,
	end: null,
	last: null
};

const diags = [
	[-1, 1],
	[1, 1],
	[1, -1],
	[-1, -1]
];

const all = [
	[-1, 1],  [0, 1],  [1, 1],
	[-1, 0],           [1, 0],
	[-1, -1], [0, -1], [1, -1]
];

const dirs = require("routorio/lib/dirs");

fusion = extendContent(LiquidRouter, "fusion-router", {
	init() {
		this.super$init();
		liquid = Vars.content.getByName(ContentType.liquid, "routorio-liquid-router");
	},

	load() {
		this.super$load();
		// Center dot
		this.topRegion = Core.atlas.find(this.name + "-top");

		/* Edges and corners which depend on the placement */
		this.edgeRegions = [
			Core.atlas.find(this.name + "-edge_0"),
			Core.atlas.find(this.name + "-edge_1")
		];

		this.cornerRegions = [];
		this.icornerRegions = [];
		for (var i = 0; i < 4; i++) {
			this.cornerRegions[i] = Core.atlas.find(this.name + "-corner_" + i);
			this.icornerRegions[i] = Core.atlas.find(this.name + "-icorner_" + i);
		}
	},

	icons() {
		return [Core.atlas.find(this.name)]
	}
});

fusion.enableDrawStatus = false;

fusion.entityType = () => {
	const ent = extendContent(LiquidRouter.LiquidRouterEntity, fusion, {
		draw() {
			if (this.liquids.total() > 0.001) {
				this.drawLiquid();
			}
			this.drawEdges();
			this.drawCorners();
			Draw.rect(fusion.topRegion, this.x, this.y);
		},

		drawLiquid() {
			Draw.color(liquid.color);
			Draw.alpha(this.liquids.total() / fusion.liquidCapacity);
			Fill.rect(this.x, this.y, Vars.tilesize, Vars.tilesize);
			Draw.reset();
		},

		drawEdges() {
			const bits = this.blendBits;
			const x = this.x, y = this.y;

			for (var i = 0; i < 4; i++) {
				// First nibble has the edges
				if ((bits & (1 << i)) == 0) {
					Draw.rect(fusion.edgeRegions[i >> 1], x, y, 90 * -i);
				}
			}
		},

		drawCorners() {
			const bits = this.blendBits;
			const x = this.x, y = this.y;

			for (var i = 0; i < 4; i++) {
				if ((bits & (256 << i)) != 0) {
					// Third nibble has the inner corners, which take priority
					Draw.rect(fusion.icornerRegions[i], x, y);
				} else if ((bits & (16 << i)) == 0) {
					// Second nibble has the outer corners
					Draw.rect(fusion.cornerRegions[i], x, y);
				}
			}
		},

		placed() {
			this.super$placed();

			// Server doesn't care about drawing, stop
			if (!Vars.ui) return;

			this.reblendAll();
			this.reblend();
		},

		onRemoved() {
			this.super$onRemoved();

			const reoucter = this.reoucter;
			Core.app.post(() => {
				if (reoucter) reoucter.refresh();

				// Server doesn't care about drawing, stop
				if (!Vars.ui) return;
				this.reblendAll();
			});
		},

		reblendAll() {
			for (var i in all) {
				var other = this.tile.getNearby(all[i][0], all[i][1]);
				if (other && other.block() == fusion) {
					other.bc().reblend();
				}
			}
		},

		reblend() {
			// All edges and outer corners by default
			var bits = 0;

			for (var i = 0; i < 4; i++) {
				var prev = this.adjacent((i + 3) % 4);
				var current = this.adjacent(i);
				if (current || prev) {
					// Can't be a corner
					bits |= 16 << i;
					if (current) {
						// Can't be a straight edge
						bits |= 1 << i;
						if (prev && this.interior(i)) {
							// It's a bend, show inner corner
							bits |= 256 << i;
						}
					}
				}
			}

			this.blendBits = bits;
		},

		adjacent(i) {
			const other = this.tile.getNearby(dirs[i].x, dirs[i].y);
			return other && other.block() == fusion;
		},

		/* Whether a router is a corner of a square or just a bend */
		interior(i) {
			const diag = this.tile.getNearby(diags[i][0], diags[i][1]);
			return diag && diag.block() != fusion;
		},

		acceptLiquid(source, type, amount) {
			return type == liquid
				&& this.liquids.total() + amount < fusion.liquidCapacity;
		},

		canOutputLiquid: (to, l) => to.block == fusion,
		h(){
			const reoucter = this.reoucter;

			var ended = false;
			var node = reoucter.last;
			while (!ended) {
				var output = node.to, source = node.from;
				node = node.next;
				if (output.acceptItem(source, item)) {
					output.handleItem(source, item);
					reoucter.last = node;
					return;
				}

				ended = node == reoucter.last;
			}
			// acceptItem said yes but handleItem said no
		},

		onProximityUpdate() {
			this.super$onProximityUpdate();

			const reoucter = this.reoucter;
			const prox = this.proximity;
			// Remove potentially broken tiles
			this.outputs = [];

			/* Add back the remaining tiles */
			for (var i = 0; i < prox.size; i++) {
				var near = prox.get(i);
				if (near.block.hasItems && near.block != fusion) {
					this.outputs.push(near);
				}
			}

			// Very slow
			if (reoucter) reoucter.rebuildOutputs();
		},

		read(stream, version) {
			this.super$read(stream, version);
			this.blendBits = stream.s();
		},
		write(stream) {
			this.super$write(stream);
			stream.s(this.blendBits);
		},

		/* Public fields */
		getReoucter() { return this._reoucter; },
		setReoucter(set) { this._reoucter = set; }
	});

	ent.reoucter = null;
	ent.blendBits = 0;

	return ent;
};

module.exports = fusion;