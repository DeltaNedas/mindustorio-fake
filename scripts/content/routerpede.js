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

// Similar to the chain blaster.
const weapon = new Weapon();
weapon.name = "chain-router";
weapon.reload = 15;
weapon.alternate = false;
weapon.ejectEffect = Fx.coreLand;
weapon.bullet = Bullets.standardCopper;

const routerpede = extendContent(UnitType, "routerpede", {
	load() {
		this.region = Core.atlas.find("router");
		this.legRegion = Core.atlas.find(this.name + "-leg");
	}
});

routerpede.constructor = () => {
	const unit = extend(MechUnit, {
		update() {
			this.super$update();
			const closest = Units.closest(this.team, this.x, this.y, routerpede.chainRadius, boolf(unit => {
				return unit !== this && unit.routerSegments !== undefined
					// The bigger chain consumes the smaller one
					&& unit.routerSegments().length <= this.segments.length
					// Max 255 segments
					&& unit.routerSegments().length + this.segments.length < 256;
			}));

			if (closest) {
				print("Closest unit is " + closest)
				// Merge the others segments
				const segments = closest.routerSegments();
				for (var i in segments) {
					this.push();
				}

				// Then consume it
				this.push();
				closest.kill();
			}
		},

		draw() {
			var n = 0;
			this.super$draw();

			// Lerping segments isn't in update because why would the server care
			if (this.segments.length == 0) return;

			const lerping = Mathf.dst(this.velocity().x, this.velocity().y) > 0.01;
			this.updateseg(0, this, lerping);
			if (this.segments.length > 0) {
				for (var i = 1; i < this.segments.length; i++) {
					this.updateseg(i, this.segments[i - 1], lerping);
				}
			}
		},

		damage(amount, withEffect) {
			if (withEffect !== undefined) {
				this.super$damage(amount, withEffect);
			} else {
				this.super$damage(amount);
			}

			if (this.segments.length == 0) return;

			const remove = this.segments.length - (this.health / routerpede.health);
			for (var i = 0; i < remove; i++) {
				this.pop();
			}
		},

		/* TODO: fix reading
		writeSave(stream, net) {
			this.super$writeSave(stream, net === undefined ? false : net);
			stream.writeByte(this.segments.length);
		},

		readSave(stream, version) {
			this.super$readSave(stream, version);
			const count = stream.readByte();
			// Saving each segment is wasteful, just recreate them
			for (var i = 0; i < count; i++) {
				this.push();
			}
		}, */

		// Lerp and draw a segment
		updateseg(i, to, lerping) {
			const seg = this.segments[i];
			// If not moving, dont lerp them
			if (lerping) {
				seg.rotation = Mathf.slerp(seg.rotation, to.rotation, 0.07);
			}
			seg.x = to.x - Angles.trnsx(seg.rotation, Vars.tilesize);
			seg.y = to.y - Angles.trnsy(seg.rotation, Vars.tilesize);

			const old = {x: this.x, y: this.y, rotation: this.rotation};
			Object.assign(this, seg);
			this.super$draw();
			Object.assign(this, old);
		},

		// Add a router to the chain
		push() {
			print("Add to " + this)
			const last = this.segments[this.segments.length - 1] || this;
			this.segments.push({
				x: last.x - Angles.trnsx(last.rotation, Vars.tilesize),
				y: last.y - Angles.trnsy(last.rotation, Vars.tilesize),
				rotation: last.rotation
			});
			this.health += routerpede.health;
		},

		// Kill a router and create an effect if on the client
		pop() {
			const seg = this.segments.pop();
			if (Vars.ui && seg) {
				ScorchDecal.create(seg.x, seg.y);
				Effects.effect(Fx.explosion, seg.x, seg.y);
				// Less shake than if it fully died
				Effects.shake(1, 1, seg.x, seg.y);
			}
		},

		// Used in chain merging
		routerSegments() {
			return this.segments;
		}
	});
	unit.segments = [];
	return unit;
};
// 1 tile radius for absorbing other chain routers
routerpede.chainRadius = Vars.tilesize;
routerpede.speed = 0.1;
routerpede.health = 80;
routerpede.weapons.add(weapon);

module.exports = routerpede;
