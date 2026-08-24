import { ContainerBuilder } from "diod";

import LoggerFactory from "../logger/infrastructure/LoggerFactory";
import { EventBus } from "../event-bus/EventBus";

const builder = new ContainerBuilder();
builder
	.register(EventBus)
	.useFactory(() => new EventBus(LoggerFactory.getLogger({ file: "EventBus" })))
	.asSingleton();

export const container = builder.build();
