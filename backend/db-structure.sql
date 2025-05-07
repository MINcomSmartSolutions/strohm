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
    AS $$
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

CREATE TABLE public.access_logs (
    id integer NOT NULL,
    user_id integer,
    ip character varying(15),
    method character varying(10) NOT NULL,
    path character varying(255) NOT NULL,
    status_code integer,
    returned_success boolean,
    response_time integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.access_logs
    OWNER TO strohm_admin;

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
-- Name: activity_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_log
(
    id          integer                                   NOT NULL,
    user_id     integer,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    reason      character varying,
    event_type  character varying,
    rfid        character varying(255)                    NOT NULL,
    target      character varying
);


ALTER TABLE public.activity_log
    OWNER TO postgres;

--
-- Name: TABLE activity_log; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.activity_log IS 'Recording interactions to odoo and steve';


--
-- Name: COLUMN activity_log.rfid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_log.rfid IS 'Even tough we have a user foreign key, we need to hold rfid history';


--
-- Name: cart; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.cart
(
    id integer NOT NULL
);


ALTER TABLE public.cart
    OWNER TO strohm_admin;

--
-- Name: TABLE cart; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON TABLE public.cart IS 'Mirror of odoo cart';


--
-- Name: cart_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cart_id_seq OWNER TO strohm_admin;

--
-- Name: cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.cart_id_seq OWNED BY public.cart.id;


--
-- Name: charging_events; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.charging_events (
    id integer NOT NULL,
    start_datetime timestamp without time zone NOT NULL,
    end_datetime timestamp without time zone NOT NULL,
    energy_kwh numeric NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    request_ref integer NOT NULL,
    price_total double precision
);


ALTER TABLE public.charging_events
    OWNER TO strohm_admin;

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

ALTER SEQUENCE public.charging_events_id_seq OWNED BY public.charging_events.id;


--
-- Name: charging_requests; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.charging_requests (
    id integer NOT NULL,
    start_datetime timestamp without time zone NOT NULL,
    end_datetime timestamp without time zone,
    station_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer NOT NULL,
    success boolean DEFAULT false,
    price_offered_ref integer
);


ALTER TABLE public.charging_requests
    OWNER TO strohm_admin;

--
-- Name: COLUMN charging_requests.price_offered_ref; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.charging_requests.price_offered_ref IS 'Initially offered price from exchange_prices table';


--
-- Name: charging_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.charging_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.charging_requests_id_seq OWNER TO strohm_admin;

--
-- Name: charging_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.charging_requests_id_seq OWNED BY public.charging_requests.id;


--
-- Name: exchange_prices; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.exchange_prices (
    id integer NOT NULL,
    price double precision NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.exchange_prices
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

ALTER SEQUENCE public.exchange_prices_exchange_id_seq OWNED BY public.exchange_prices.id;


--
-- Name: odoo_apikeys; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.odoo_apikeys
(
    id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    key character varying NOT NULL,
    user_id integer,
    revoked_at timestamp without time zone,
    salt character varying NOT NULL
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

CREATE TABLE public.sessions (
    user_id integer NOT NULL,
    id integer NOT NULL,
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
-- Name: transactions; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.transactions
(
    id              bigint                      NOT NULL,
    random_key      character varying,
    "user"          integer                     NOT NULL,
    pay_method_mask bytea,
    creditcard_mask bytea,
    cart            integer,
    return_status   integer,
    return_message  character varying(512),
    "timestamp"     timestamp without time zone NOT NULL
);


ALTER TABLE public.transactions
    OWNER TO strohm_admin;

--
-- Name: COLUMN transactions.id; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.transactions.id IS 'txnId';


--
-- Name: COLUMN transactions."user"; Type: COMMENT; Schema: public; Owner: strohm_admin
--

COMMENT ON COLUMN public.transactions."user" IS 'Customer';


--
-- Name: transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: strohm_admin
--

CREATE SEQUENCE public.transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transaction_id_seq OWNER TO strohm_admin;

--
-- Name: transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: strohm_admin
--

ALTER SEQUENCE public.transaction_id_seq OWNED BY public.transactions.id;


--
-- Name: transaction_statuses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transaction_statuses
(
    id            integer                     NOT NULL,
    status_desc   character varying(35),
    status_code   bigint,
    type_code     bigint,
    txn           bigint                      NOT NULL,
    pay_srvc_id   bigint,
    pay_srvc_name bigint,
    "timestamp"   timestamp without time zone NOT NULL
);


ALTER TABLE public.transaction_statuses
    OWNER TO postgres;

--
-- Name: transaction_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transaction_statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transaction_statuses_id_seq OWNER TO postgres;

--
-- Name: transaction_statuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transaction_statuses_id_seq OWNED BY public.transaction_statuses.id;


--
-- Name: user_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_activity_id_seq OWNER TO postgres;

--
-- Name: user_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_activity_id_seq OWNED BY public.activity_log.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: strohm_admin
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    first_name character varying(255),
    email character varying(255) NOT NULL,
    rfid character varying(255),
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp without time zone,
    odoo_user_id integer,
    last_name character varying,
    lastlogin_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    oauth_id character varying(255),
    postal_code integer,
    address character varying(255),
    odoo_partner_id integer,
    name     character varying,
    steve_id integer
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
-- Name: access_logs id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.access_logs ALTER COLUMN id SET DEFAULT nextval('public.access_logs_id_seq'::regclass);


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log
    ALTER COLUMN id SET DEFAULT nextval('public.user_activity_id_seq'::regclass);


--
-- Name: cart id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.cart
    ALTER COLUMN id SET DEFAULT nextval('public.cart_id_seq'::regclass);


--
-- Name: charging_events id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_events ALTER COLUMN id SET DEFAULT nextval('public.charging_events_id_seq'::regclass);


--
-- Name: charging_requests id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_requests ALTER COLUMN id SET DEFAULT nextval('public.charging_requests_id_seq'::regclass);


--
-- Name: exchange_prices id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.exchange_prices ALTER COLUMN id SET DEFAULT nextval('public.exchange_prices_exchange_id_seq'::regclass);


--
-- Name: odoo_apikeys id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.odoo_apikeys
    ALTER COLUMN id SET DEFAULT nextval('public.odoo_tokens_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: transaction_statuses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_statuses
    ALTER COLUMN id SET DEFAULT nextval('public.transaction_statuses_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.transactions
    ALTER COLUMN id SET DEFAULT nextval('public.transaction_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Data for Name: access_logs; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.access_logs (id, user_id, ip, method, path, status_code, returned_success, response_time, created_at) FROM stdin;
\.


--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_log (id, user_id, "timestamp", reason, event_type, rfid, target) FROM stdin;
\.


--
-- Data for Name: cart; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.cart (id) FROM stdin;
\.


--
-- Data for Name: charging_events; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.charging_events (id, start_datetime, end_datetime, energy_kwh, created_at, request_ref, price_total) FROM stdin;
\.


--
-- Data for Name: charging_requests; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.charging_requests (id, start_datetime, end_datetime, station_id, created_at, updated_at, user_id, success, price_offered_ref) FROM stdin;
\.


--
-- Data for Name: exchange_prices; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.exchange_prices (id, price, "timestamp", created_at) FROM stdin;
\.


--
-- Data for Name: odoo_apikeys; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.odoo_apikeys (id, created_at, key, user_id, revoked_at, salt) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.sessions (user_id, id, odoo_session_id, created_at) FROM stdin;
\.


--
-- Data for Name: transaction_statuses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transaction_statuses (id, status_desc, status_code, type_code, txn, pay_srvc_id, pay_srvc_name,
                                  "timestamp") FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.transactions (id, random_key, "user", pay_method_mask, creditcard_mask, cart, return_status, return_message,
                          "timestamp") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: strohm_admin
--

COPY public.users (user_id, first_name, email, rfid, active, created_at, updated_at, deleted_at, odoo_user_id,
                   last_name, lastlogin_at, oauth_id, postal_code, address, odoo_partner_id, name, steve_id) FROM stdin;
\.


--
-- Name: access_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.access_logs_id_seq', 1, false);


--
-- Name: cart_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.cart_id_seq', 1, false);


--
-- Name: charging_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.charging_events_id_seq', 1, false);


--
-- Name: charging_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.charging_requests_id_seq', 1, false);


--
-- Name: exchange_prices_exchange_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.exchange_prices_exchange_id_seq', 1, false);


--
-- Name: odoo_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.odoo_tokens_id_seq', 24, true);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.sessions_id_seq', 1, false);


--
-- Name: transaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.transaction_id_seq', 1, false);


--
-- Name: transaction_statuses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transaction_statuses_id_seq', 1, false);


--
-- Name: user_activity_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_activity_id_seq', 1, false);


--
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: strohm_admin
--

SELECT pg_catalog.setval('public.users_user_id_seq', 30, true);


--
-- Name: access_logs access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT access_logs_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pk PRIMARY KEY (id);


--
-- Name: cart cart_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_pk PRIMARY KEY (id);


--
-- Name: charging_events charging_events_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_events
    ADD CONSTRAINT charging_events_pkey PRIMARY KEY (id);


--
-- Name: charging_requests charging_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_requests
    ADD CONSTRAINT charging_requests_pkey PRIMARY KEY (id);


--
-- Name: exchange_prices exchange_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.exchange_prices
    ADD CONSTRAINT exchange_prices_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pk PRIMARY KEY (id);


--
-- Name: transaction_statuses transaction_statuses_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_statuses
    ADD CONSTRAINT transaction_statuses_pk PRIMARY KEY (id);


--
-- Name: transactions transactions_pk; Type: CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pk PRIMARY KEY (id);


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
-- Name: idx_charging_events_request_ref; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE INDEX idx_charging_events_request_ref ON public.charging_events USING btree (request_ref);


--
-- Name: idx_charging_requests_station_id; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE INDEX idx_charging_requests_station_id ON public.charging_requests USING btree (station_id);


--
-- Name: odoo_apikeys_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX odoo_apikeys_id_uindex ON public.odoo_apikeys USING btree (id);


--
-- Name: sessions_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX sessions_id_uindex ON public.sessions USING btree (id);


--
-- Name: transactions_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX transactions_id_uindex ON public.transactions USING btree (id);


--
-- Name: users_oauth_id_index; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX users_oauth_id_index ON public.users USING btree (oauth_id);


--
-- Name: users_odoo_user_id_uindex; Type: INDEX; Schema: public; Owner: strohm_admin
--

CREATE UNIQUE INDEX users_odoo_user_id_uindex ON public.users USING btree (odoo_user_id);


--
-- Name: charging_requests update_charging_requests_timestamp; Type: TRIGGER; Schema: public; Owner: strohm_admin
--

CREATE TRIGGER update_charging_requests_timestamp BEFORE UPDATE ON public.charging_requests FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: access_logs access_logs_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT access_logs_ref_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: activity_log activity_log_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_users_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id);


--
-- Name: charging_events charging_events_request_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_events
    ADD CONSTRAINT charging_events_request_ref_fkey FOREIGN KEY (request_ref) REFERENCES public.charging_requests(id) ON DELETE CASCADE;


--
-- Name: charging_requests charging_requests_exchange_prices_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_requests
    ADD CONSTRAINT charging_requests_exchange_prices_id_fk FOREIGN KEY (price_offered_ref) REFERENCES public.exchange_prices(id);


--
-- Name: charging_requests charging_requests_user_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.charging_requests
    ADD CONSTRAINT charging_requests_user_ref_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: odoo_apikeys odoo_apikeys_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.odoo_apikeys
    ADD CONSTRAINT odoo_apikeys_users_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE;


--
-- Name: sessions sessions_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_users_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: transaction_statuses transaction_statuses_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_statuses
    ADD CONSTRAINT transaction_statuses_transactions_id_fk FOREIGN KEY (txn) REFERENCES public.transactions (id);


--
-- Name: transactions transactions_users_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: strohm_admin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_users_user_id_fk FOREIGN KEY ("user") REFERENCES public.users (user_id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO strohm_admin;


--
-- PostgreSQL database dump complete
--

