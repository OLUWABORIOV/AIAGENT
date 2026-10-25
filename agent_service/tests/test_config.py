"""Settings parsing tests, especially for API_KEYS on Render/Vercel."""

import pytest

from app.config import Settings


def _settings_with_env(monkeypatch, value: str) -> Settings:
    monkeypatch.setenv("API_KEYS", value)
    return Settings(_env_file=None)


def test_api_keys_accepts_single_plain_key(monkeypatch):
    settings = _settings_with_env(monkeypatch, "stillwork-secret")
    assert settings.api_keys == ["stillwork-secret"]


def test_api_keys_accepts_comma_separated_keys(monkeypatch):
    settings = _settings_with_env(monkeypatch, "first-key, second-key")
    assert settings.api_keys == ["first-key", "second-key"]


def test_api_keys_accepts_json_array(monkeypatch):
    settings = _settings_with_env(monkeypatch, '["first-key", "second-key"]')
    assert settings.api_keys == ["first-key", "second-key"]


def test_api_keys_empty_string_means_no_accepted_keys(monkeypatch):
    settings = _settings_with_env(monkeypatch, "")
    assert settings.api_keys == []
