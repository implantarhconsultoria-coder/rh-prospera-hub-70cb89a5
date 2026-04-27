import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/");
  }, []);
  return null;
};

export default Index;
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const unidade = params.get("unidade");

    if (unidade) {
      localStorage.setItem("UNIDADE_APP", unidade);
    }

    if (location.search) {
      navigate("/", { replace: true });
    }
  }, [location.search, navigate]);

  return null;
};

export default Index;
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const unidade = params.get("unidade");

    if (unidade) {
      localStorage.setItem("UNIDADE_APP", unidade);
    }

    navigate("/", { replace: true });
  }, [location.search, navigate]);

  return null;
};

export default Index;
import React, { ReactNode, useRef } from "react";

type PrintOnlyProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export default function PrintOnly({ title, children, className }: PrintOnlyProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={className}>
      <div className="no-print mb-4">
        <button onClick={handlePrint} className="px-4 py-2 rounded bg-blue-600 text-white">
          Imprimir Ficha
        </button>
      </div>

      <div id="print-root" ref={ref} className="print-sheet bg-white text-black">
        {title ? <h1 className="text-xl font-bold text-center mb-4">{title}</h1> : null}
        {children}
      </div>
    </div>
  );
}
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const unidade = params.get("unidade");

    if (unidade) {
      localStorage.setItem("UNIDADE_APP", unidade);
    }

    navigate("/", { replace: true });
  }, [location.search, navigate]);

  return null;
};

export default Index;
