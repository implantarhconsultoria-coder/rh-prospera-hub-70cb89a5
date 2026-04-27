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
