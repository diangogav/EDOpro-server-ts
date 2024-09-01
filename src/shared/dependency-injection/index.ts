import { ContainerBuilder } from "diod";

import { EventBus } from "../event-bus/EventBus";

const builder = new ContainerBuilder();
builder.registerAndUse(EventBus).asSingleton();

export const container = builder.build();
