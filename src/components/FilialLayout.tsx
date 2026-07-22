import React, { useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import FilialSidebar from '@/components/FilialSidebar';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2, LogOut } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import