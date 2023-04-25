import net from 'net'
import { Client } from './Client';

export type RoomAttr = {
	roomid: number,
	roomname: string,
	roomnotes: string,
	roommode: number,
	needpass: boolean,
	team1: number,
	team2: number,
	best_of: number,
	duel_flag: number,
	forbidden_types: number,
	extra_rules: number,
	start_lp: number,
	start_hand: number,
	draw_count: number,
	time_limit: number,
	rule: number,
	no_check: boolean,
	no_shuffle: boolean,
	banlist_hash: number,
	istart: string,
	main_min: number,
	main_max: number,
	extra_min: number,
	extra_max: number,
	side_min: number,
	side_max: number,
	users: { pos: number; name: string}[]
}

export class Room {
	public readonly roomid: number;
	public readonly roomname: string;
	public readonly roomnotes: string;
	public readonly roommode: number;
	public readonly needpass: boolean;
	public readonly team1: number;
	public readonly team2: number;
	public readonly best_of: number;
	public readonly duel_flag: number;
	public readonly forbidden_types: number;
	public readonly extra_rules: number;
	public readonly start_lp: number;
	public readonly start_hand: number;
	public readonly draw_count: number;
	public readonly time_limit: number;
	public readonly rule: number;
	public readonly no_check: boolean;
	public readonly no_shuffle: boolean;
	public readonly banlist_hash: number;
	public readonly istart: string;
	public readonly main_min: number;
	public readonly main_max: number;
	public readonly extra_min: number;
	public readonly extra_max: number;
	public readonly side_min: number;
	public readonly side_max: number;
	public readonly users: { pos: number; name: string}[]
	public readonly clients: Client[] = []

	constructor(attr: RoomAttr) {
		this.roomid = attr?.roomid
		this.roomname = attr?.roomname
		this.roomnotes = attr?.roomnotes
		this.roommode = attr?.roommode
		this.needpass = attr?.needpass
		this.team1 = attr?.team1
		this.team2 = attr?.team2
		this.best_of = attr?.best_of
		this.duel_flag = attr?.duel_flag
		this.forbidden_types = attr?.forbidden_types
		this.extra_rules = attr?.extra_rules
		this.start_lp = attr?.start_lp
		this.start_hand = attr?.start_hand
		this.draw_count = attr?.draw_count
		this.time_limit = attr?.time_limit
		this.rule = attr?.rule
		this.no_check = attr?.no_check
		this.no_shuffle = attr?.no_shuffle
		this.banlist_hash = attr?.banlist_hash
		this.istart = attr?.istart
		this.main_min = attr?.main_min
		this.main_max = attr?.main_max
		this.extra_min = attr?.extra_min
		this.extra_max = attr?.extra_max
		this.side_min = attr?.side_min
		this.side_max = attr?.side_max
		this.users = attr?.users
	}

	addClient(client: Client) {
		this.clients.push(client)
	}

	removeClient(client: Client) {

	}

	start() {
		console.log('Room Start')
	}
}