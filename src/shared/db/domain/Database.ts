export interface Database {
	connect(): Promise<void>;
}
