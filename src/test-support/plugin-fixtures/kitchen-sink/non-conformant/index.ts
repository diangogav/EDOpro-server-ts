// Simulates a plugin module whose default export does not conform to the
// ServerPlugin contract (missing register()).
export default {
	name: "non-conformant",
	enabled: () => true,
};
