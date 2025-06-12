--
-- PostgreSQL database cluster dump
--

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE odoo_admin;
ALTER ROLE odoo_admin WITH NOSUPERUSER INHERIT NOCREATEROLE CREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:5zZf62Kzy5Vn2EJOs9aZWQ==$FRL9Qdyl5LbvfacQeZnvXTdWEjoTwXepEbgHcc2W0y0=:4E+mus8zsXmkiynxSHUllm2+hJE8wl3Ci2ABKmzjnSw=';
CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:vV4Dpw9AvaiGfJ5zh0SLcg==$zFK9HPrbXt1aqsX34vUSwOgoNsvzcGJs/DTb38DiSC4=:OJQXPbjwfYxnTGGUN3VlGtB63GEtVd2SpvPxg2wHhsw=';
CREATE ROLE strohm_admin;
ALTER ROLE strohm_admin WITH NOSUPERUSER INHERIT NOCREATEROLE CREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:SREUxry/ac0uWOdlB163nA==$6A+P9Cw5PDaL0LwTqwgSQRrzfO+soqTMq+DJMUlw+Pg=:wNtSpnLCeqH/YnhA3KdRgSPXi/RGh88L4xIgtwwWIX4=';

--
-- User Configurations
--








--
-- PostgreSQL database cluster dump complete
--

