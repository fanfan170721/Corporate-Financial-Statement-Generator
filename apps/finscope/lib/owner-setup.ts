import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { createOwnerSetup } from "./owner-setup-core";

const setup = createOwnerSetup({ env, gatewayIdentity: getChatGPTUser });
export const getOwnerSetupAccess = setup.getAccess;
export const handleOwnerSetup = setup.handler;
