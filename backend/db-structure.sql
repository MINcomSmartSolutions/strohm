--
-- PostgreSQL database dump
--

-- Dumped from database version 16.6 (Debian 16.6-1.pgdg120+1)
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE strohm;
--
-- Name: strohm; Type: DATABASE; Schema: -; Owner: strohm_admin
--

CREATE DATABASE strohm WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE strohm OWNER TO strohm_admin;

\connect strohm

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE strohm; Type: COMMENT; Schema: -; Owner: strohm_admin
--

COMMENT ON DATABASE strohm IS 'Database for stroHM project. All datetime''s are in UTC timezone';


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_logs; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.access_logs
(
    id          integer                                            NOT NULL,
    user_id     integer,
    ip          character varying(15),
    method      character varying(10)                              NOT NULL,
    path        character varying(255)                             NOT NULL,
    status_code integer,
    returned_success boolean,
    response_time integer,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.access_logs
    OWNER TO strohm_admin;

--
-- Name: TABLE access_logs; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON TABLE public.access_logs IS 'Should not be stored in DB, perhaps access.log';


--
-- Name: access_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.access_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.access_logs_id_seq OWNER TO strohm_admin;

--
-- Name: access_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.access_logs_id_seq OWNED BY public.access_logs.id;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.activity_log
(
    id       integer                                            NOT NULL,
    user_id  integer,
    datetime timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reason   character varying,
    event_type character varying,
    rfid     character varying(255)                             NOT NULL,
    target   character varying
);


ALTER TABLE public.activity_log
    OWNER TO strohm_admin;

--
-- Name: TABLE activity_log; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON TABLE public.activity_log IS 'Record interactions';


--
-- Name: COLUMN activity_log.rfid; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.activity_log.rfid IS 'Even tough we have a user foreign key, we need to hold rfid history';


--
-- Name: charging_transactions; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.charging_transactions
(
    id              integer NOT NULL,
    created_at      timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    start_timestamp timestamp with time zone,
    stop_timestamp  timestamp with time zone,
    stop_reason     character varying,
    start_value     numeric,
    stop_value      numeric,
    delivered_energy_wh numeric GENERATED ALWAYS AS ((stop_value - start_value)) STORED,
    ocpp_id_tag     character varying,
    chargebox_pk    integer,
    connector_id    integer,
    stop_event_actor character varying,
    invoice_ref     integer,
    steve_id        integer NOT NULL,
    CONSTRAINT always_positive CHECK ((delivered_energy_wh >= 0.0))
);


ALTER TABLE public.charging_transactions
    OWNER TO strohm_admin;

--
-- Name: TABLE charging_transactions; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON TABLE public.charging_transactions IS 'Bzw. charging transactions/sessions. 
For active transactions, all ''stop''-prefixed fields would be null. 
The energy consumed during the transaction can be calculated by subtracting the ''startValue'' from the ''stopValue''. The unit of the ''startValue'' and ''stopValue'' is watt-hours (Wh).';


--
-- Name: COLUMN charging_transactions.start_timestamp; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.start_timestamp IS 'The timestamp at which the transaction started';


--
-- Name: COLUMN charging_transactions.stop_timestamp; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.stop_timestamp IS 'The timestamp at which the transaction ended';


--
-- Name: COLUMN charging_transactions.stop_reason; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.stop_reason IS 'The reason for the transaction being stopped';


--
-- Name: COLUMN charging_transactions.start_value; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.start_value IS 'The meter value reading at the start of the transaction Wh';


--
-- Name: COLUMN charging_transactions.stop_value; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.stop_value IS 'The meter value reading at the end of the transaction Wh';


--
-- Name: COLUMN charging_transactions.ocpp_id_tag; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.ocpp_id_tag IS 'The Ocpp Tag used in the transaction. RFID';


--
-- Name: COLUMN charging_transactions.chargebox_pk; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.chargebox_pk IS 'PK of the charge box at which the transaction took place. IDK if we need to store it';


--
-- Name: COLUMN charging_transactions.connector_id; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.connector_id IS 'Connector ID of the charge box at which the transaction took place. IDK if we need to store it';


--
-- Name: COLUMN charging_transactions.stop_event_actor; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_transactions.stop_event_actor IS 'The actor who stopped the transaction Allowed values  "station""manual"';


--
-- Name: charging_events_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.charging_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.charging_events_id_seq OWNER TO strohm_admin;

--
-- Name: charging_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.charging_events_id_seq OWNED BY public.charging_transactions.id;


--
-- Name: electricity_prices; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.electricity_prices
(
    id         integer                  NOT NULL,
    price      double precision         NOT NULL,
    datetime   timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.electricity_prices
    OWNER TO strohm_admin;

--
-- Name: exchange_prices_exchange_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.exchange_prices_exchange_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.exchange_prices_exchange_id_seq OWNER TO strohm_admin;

--
-- Name: exchange_prices_exchange_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.exchange_prices_exchange_id_seq OWNED BY public.electricity_prices.id;


--
-- Name: odoo_apikeys; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.odoo_apikeys
(
    id         integer                                            NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    key        character varying                                  NOT NULL,
    user_id integer,
    revoked_at timestamp with time zone,
    salt       character varying                                  NOT NULL
);


ALTER TABLE public.odoo_apikeys
    OWNER TO strohm_admin;

--
-- Name: COLUMN odoo_apikeys.key; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.odoo_apikeys.key IS 'Encrypted odoo user api_key in base64';


--
-- Name: COLUMN odoo_apikeys.salt; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.odoo_apikeys.salt IS 'key_salt in base64';


--
-- Name: odoo_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.odoo_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.odoo_tokens_id_seq OWNER TO strohm_admin;

--
-- Name: odoo_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.odoo_tokens_id_seq OWNED BY public.odoo_apikeys.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.sessions
(
    user_id integer NOT NULL,
    id      integer NOT NULL,
    odoo_session_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.sessions
    OWNER TO strohm_admin;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessions_id_seq OWNER TO strohm_admin;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: user_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.user_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_activity_id_seq OWNER TO strohm_admin;

--
-- Name: user_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.user_activity_id_seq OWNED BY public.activity_log.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.users
(
    user_id     integer                                            NOT NULL,
    first_name  character varying(255),
    email       character varying(255)                             NOT NULL,
    rfid        character varying(255),
    active      boolean                  DEFAULT true,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at  timestamp without time zone,
    odoo_user_id integer,
    last_name   character varying,
    lastlogin_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    oauth_id    character varying(255),
    postal_code integer,
    address     character varying(255),
    odoo_partner_id integer,
    name        character varying,
    steve_id    integer
);


ALTER TABLE public.users
    OWNER TO strohm_admin;

--
-- Name: COLUMN users.rfid; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.users.rfid IS 'Bzw. id tag in SteVe';


--
-- Name: COLUMN users.oauth_id; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.users.oauth_id IS 'Subject Identifier';


--
-- Name: COLUMN users.steve_id; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.users.steve_id IS 'Bzw. ocpp tag pk';


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_user_id_seq OWNER TO strohm_admin;

--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: watermark; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.watermark
(
    last_stop_timestamp timestamp with time zone,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id                  integer                                            NOT NULL,
    iterated_at         timestamp with time zone
);


ALTER TABLE public.watermark
    OWNER TO strohm_admin;

--
-- Name: watermark_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.watermark_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.watermark_id_seq OWNER TO strohm_admin;

--
-- Name: watermark_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.watermark_id_seq OWNED BY public.watermark.id;


--
-- Name: access_logs id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.access_logs
    ALTER COLUMN id SET DEFAULT nextval('public.access_logs_id_seq'::regclass);


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.activity_log
    ALTER COLUMN id SET DEFAULT nextval('public.user_activity_id_seq'::regclass);


--
-- Name: charging_transactions id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_transactions
    ALTER COLUMN id SET DEFAULT nextval('public.charging_events_id_seq'::regclass);


--
-- Name: electricity_prices id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.electricity_prices
    ALTER COLUMN id SET DEFAULT nextval('public.exchange_prices_exchange_id_seq'::regclass);


--
-- Name: odoo_apikeys id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.odoo_apikeys
    ALTER COLUMN id SET DEFAULT nextval('public.odoo_tokens_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.sessions
    ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.users
    ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: watermark id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.watermark
    ALTER COLUMN id SET DEFAULT nextval('public.watermark_id_seq'::regclass);


--
-- Name: access_logs access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT access_logs_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pk PRIMARY KEY (id);


--
-- Name: charging_transactions charging_transactions_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_transactions
    ADD CONSTRAINT charging_transactions_pk UNIQUE (steve_id);


--
-- Name: charging_transactions charging_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_transactions
    ADD CONSTRAINT charging_transactions_pkey PRIMARY KEY (id);


--
-- Name: electricity_prices exchange_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.electricity_prices
    ADD CONSTRAINT exchange_prices_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pk PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_rfid_key; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_rfid_key UNIQUE (rfid);


--
-- Name: watermark watermark_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.watermark
    ADD CONSTRAINT watermark_pk PRIMARY KEY (id);


--
-- Name: watermark watermark_pk_timestamp; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.watermark
    ADD CONSTRAINT watermark_pk_timestamp UNIQUE (last_stop_timestamp);


--
-- Name: odoo_apikeys_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX odoo_apikeys_id_uindex ON public.odoo_apikeys USING btree (id);


--
-- Name: sessions_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX sessions_id_uindex ON public.sessions USING btree (id);


--
-- Name: users_oauth_id_index; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX users_oauth_id_index ON public.users USING btree (oauth_id);


--
-- Name: users_odoo_user_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX users_odoo_user_id_uindex ON public.users USING btree (odoo_user_id);


--
-- Name: access_logs access_logs_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT access_logs_ref_fkey FOREIGN KEY (user_id) REFERENCES public.users (user_id);


--
-- Name: activity_log activity_log_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_users_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE SET NULL;


--
-- Name: odoo_apikeys odoo_apikeys_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.odoo_apikeys
    ADD CONSTRAINT odoo_apikeys_users_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE;


--
-- Name: sessions sessions_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_users_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO strohm_admin;


--
-- PostgreSQL database dump complete
--

