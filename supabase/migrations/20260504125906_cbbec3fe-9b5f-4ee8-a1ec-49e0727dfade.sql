-- Remove papel admin de qualquer usuário cujo email seja diego@topac.app
DELETE FROM public.user_roles
 WHERE role = 'admin'
   AND user_id IN (
     SELECT id FROM auth.users WHERE lower(email) = 'diego@topac.app'
   );