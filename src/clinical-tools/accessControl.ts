import type { MembershipTier } from './types'; const rank={basic:1,pro:2,elite:3}; export const canAccessTool=(user:MembershipTier,required:MembershipTier)=>rank[user]>=rank[required];
