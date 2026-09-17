alter view public.payroll_identity_readiness_v set (security_invoker = true);
revoke all on public.payroll_identity_readiness_v from anon;
grant select on public.payroll_identity_readiness_v to authenticated;