const decoder = new TextDecoder();

export class Buffer {
	inner: Uint8Array;

	static new(): Buffer {
		return new Buffer(new Uint8Array());
	}

	constructor(inner: Uint8Array | number[], copy?: boolean) {
		if (inner instanceof Uint8Array) {
			if (copy) {
				this.inner = inner.slice();
			} else {
				this.inner = inner;
			}
		} else {
			this.inner = Uint8Array.from(inner);
		}
	}

	copy(): Buffer {
		return new Buffer(this.inner.slice());
	}

	// precious allocations...
	take(cnt: number): Buffer {
		if (this.length < cnt) throw new Error("data too small");

		const ret = this.inner.subarray(0, cnt);
		this.inner = this.inner.subarray(cnt);
		return new Buffer(ret);
	}

	resize(newlen: number) {
		const arr = new Uint8Array(new ArrayBuffer(newlen));
		arr.set(this.inner);
		this.inner = arr;
	}

	extend(buf: Buffer) {
		const loc = this.inner.length;
		this.resize(this.inner.length + buf.inner.length);
		this.inner.set(buf.inner, loc);
	}

	get(idx: number): number {
		return this.inner[idx];
	}

	toArray(): number[] {
		return Array.from(this.inner);
	}
	toStr(): string {
		return decoder.decode(this.inner);
	}

	get length(): number {
		return this.inner.length;
	}

	readString(): string {
		const len = this.readVarInt();
		const ret = new TextDecoder().decode(this.take(len).inner);
		return ret;
	}

	writeString(str: string) {
		const data = new TextEncoder().encode(str);
		this.writeVarInt(data.length);
		this.extend(new Buffer(data));
	}

	readUByte(): number {
		const ret = this.get(0);
		this.take(1);
		return ret;
	}

	writeUByte(num: number) {
		this.extend(new Buffer([num & 0xff]));
	}

	readUShort(): number {
		const ret = (this.get(0) << 8) | this.get(1);
		this.take(2);
		return ret;
	}

	writeUShort(num: number) {
		this.extend(new Buffer([num >> 8, num & 0xff]));
	}

	readLong(): number {
		let ret = 0;
		for (let i = 0; i < 8; i++) {
			ret |= this.get(i) << (i * 8);
		}
		this.take(8);
		return ret;
	}

	writeLong(num: number) {
		for (let i = 0; i < 8; i++) {
			this.extend(new Buffer([num & 0xff]));
			num >>= 8;
		}
	}

	// you can probably make this better
	readVarInt(take: boolean = true): number {
		let index = 0;
		let result = 0;
		let shift = 0;
		let byte: number;

		do {
			if (index >= this.inner.length) {
				throw new Error("data too small");
			}
			byte = this.get(index++);
			result |= (byte & 127) << shift;
			shift += 7;
		} while (byte >= 128);

		if (take) this.take(index);
		return result;
	}

	readVariableData(): Buffer {
		const len = this.readVarInt();
		if (!len) throw new Error("data too small");
		return this.take(len);
	}

	writeVarInt(num: number) {
		const buffer: number[] = [];
		while (num > 127) {
			buffer.push((num & 127) | 128);
			num >>>= 7;
		}
		buffer.push(num);
		this.extend(new Buffer(buffer));
	}

	writeVariableData(data: Buffer) {
		this.writeVarInt(data.length);
		this.extend(data);
	}

	writeBytes(data: number[]) {
		this.extend(new Buffer(data));
	}
}
