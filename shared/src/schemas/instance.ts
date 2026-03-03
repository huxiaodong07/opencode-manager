import { z } from 'zod'

export const ProviderKindSchema = z.enum(['opencode', 'qwen'])

export const InstanceStatusSchema = z.enum(['online', 'offline', 'degraded'])

export const CapabilityFlagsSchema = z.object({
  chat: z.boolean(),
  session: z.boolean(),
  mcp: z.boolean(),
  skill: z.boolean(),
  streaming: z.boolean(),
  fileOps: z.boolean(),
})

export const ProviderDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: ProviderKindSchema,
  version: z.string().min(1),
  capabilities: CapabilityFlagsSchema,
})

export const AgentInstanceSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  status: InstanceStatusSchema,
  provider: ProviderDescriptorSchema,
  lastHeartbeatAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const RegisterInstanceRequestSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  provider: ProviderDescriptorSchema,
})

export const RegisterInstanceResponseSchema = z.object({
  success: z.literal(true),
  instance: AgentInstanceSchema,
})

export const InstanceHeartbeatRequestSchema = z.object({
  status: InstanceStatusSchema,
  provider: ProviderDescriptorSchema.optional(),
})

export const RotateInstanceTokenRequestSchema = z.object({
  gracePeriodMs: z.number().int().min(0).max(300000).default(30000),
})

export const RotateInstanceTokenResponseSchema = z.object({
  success: z.literal(true),
  tokenId: z.string().min(1),
  token: z.string().min(1),
  expiresAt: z.number().int().nonnegative(),
  previousTokenExpiresAt: z.number().int().nonnegative().optional(),
})

export const RevokeInstanceTokenRequestSchema = z.object({
  tokenId: z.string().min(1),
})

export const InstanceAuthContextSchema = z.object({
  instanceId: z.string().min(1),
  tokenId: z.string().min(1),
})

export type ProviderKind = z.infer<typeof ProviderKindSchema>
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>
export type CapabilityFlags = z.infer<typeof CapabilityFlagsSchema>
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>
export type AgentInstance = z.infer<typeof AgentInstanceSchema>
export type RegisterInstanceRequest = z.infer<typeof RegisterInstanceRequestSchema>
export type RegisterInstanceResponse = z.infer<typeof RegisterInstanceResponseSchema>
export type InstanceHeartbeatRequest = z.infer<typeof InstanceHeartbeatRequestSchema>
export type RotateInstanceTokenRequest = z.infer<typeof RotateInstanceTokenRequestSchema>
export type RotateInstanceTokenResponse = z.infer<typeof RotateInstanceTokenResponseSchema>
export type RevokeInstanceTokenRequest = z.infer<typeof RevokeInstanceTokenRequestSchema>
export type InstanceAuthContext = z.infer<typeof InstanceAuthContextSchema>
