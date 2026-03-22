import { ContainerBuilder } from "diod";

import { EventBus } from "../event-bus/EventBus";
import { YGOProResourceLoader } from "../../mercury/ygopro/ygopro-resource-loader";

const builder = new ContainerBuilder();
builder.registerAndUse(EventBus).asSingleton();
builder.registerAndUse(YGOProResourceLoader).asSingleton();

export const container = builder.build();
