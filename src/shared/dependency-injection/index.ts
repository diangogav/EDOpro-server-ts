import { ContainerBuilder } from "diod";

import LoggerFactory from "../logger/infrastructure/LoggerFactory";
import { EventBus } from "../event-bus/EventBus";
import { MatchLifecycleHooks } from "../room/application/lifecycle/MatchLifecycleHooks";

const builder = new ContainerBuilder();
builder
	.register(EventBus)
	.useFactory(() => new EventBus(LoggerFactory.getLogger({ file: "EventBus" })))
	.asSingleton();
builder
	.register(MatchLifecycleHooks)
	.useFactory(
		() => new MatchLifecycleHooks(LoggerFactory.getLogger({ file: "MatchLifecycleHooks" })),
	)
	.asSingleton();

export const container = builder.build();
