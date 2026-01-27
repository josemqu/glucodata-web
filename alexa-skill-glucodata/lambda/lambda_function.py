import os
import requests

from typing import Any, Dict, Optional

from ask_sdk_core.skill_builder import SkillBuilder
from ask_sdk_core.dispatch_components import AbstractRequestHandler
from ask_sdk_core.dispatch_components import AbstractExceptionHandler
from ask_sdk_core.handler_input import HandlerInput
from ask_sdk_model import Response


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _fetch_latest_glucose() -> Optional[Dict[str, Any]]:
    url = _require_env("GLUCO_API_URL")
    token = _require_env("GLUCO_API_TOKEN")

    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()

    if not payload.get("success"):
        raise RuntimeError(payload.get("error") or "API returned success=false")

    return payload.get("data")


def _speak_value(data: Optional[Dict[str, Any]]) -> str:
    if not data:
        return "No tengo datos de glucemia recientes."

    value = data.get("value")
    unit = data.get("unit") or "mg por decilitro"
    status = (data.get("status") or {}).get("label")

    if value is None:
        return "No tengo datos de glucemia recientes."

    try:
        value_int = int(round(float(value)))
    except Exception:
        return "No pude interpretar el valor de tu glucemia."

    unit_spoken = "mg por decilitro" if str(unit).lower().startswith("mg") else str(unit)

    if status:
        return f"Tu glucemia actual es {value_int} {unit_spoken}. Estado: {status}."

    return f"Tu glucemia actual es {value_int} {unit_spoken}."


class LaunchRequestHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        return handler_input.request_envelope.request.object_type == "LaunchRequest"

    def handle(self, handler_input: HandlerInput) -> Response:
        try:
            data = _fetch_latest_glucose()
            speak_output = _speak_value(data)
        except Exception:
            speak_output = "No pude obtener tu glucemia en este momento."

        return (
            handler_input.response_builder.speak(speak_output)
            .set_should_end_session(True)
            .response
        )


class GetGlucoseIntentHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        req = handler_input.request_envelope.request
        return req.object_type == "IntentRequest" and req.intent.name == "GetGlucoseIntent"

    def handle(self, handler_input: HandlerInput) -> Response:
        try:
            data = _fetch_latest_glucose()
            speak_output = _speak_value(data)
        except Exception:
            speak_output = "No pude obtener tu glucemia en este momento."

        return handler_input.response_builder.speak(speak_output).response


class HelpIntentHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        req = handler_input.request_envelope.request
        return req.object_type == "IntentRequest" and req.intent.name == "AMAZON.HelpIntent"

    def handle(self, handler_input: HandlerInput) -> Response:
        speak_output = "Podés decir: ¿cuánta glucemia tengo?"
        return (
            handler_input.response_builder.speak(speak_output)
            .ask(speak_output)
            .response
        )


class CancelOrStopIntentHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        req = handler_input.request_envelope.request
        return (
            req.object_type == "IntentRequest"
            and req.intent.name in ("AMAZON.CancelIntent", "AMAZON.StopIntent")
        )

    def handle(self, handler_input: HandlerInput) -> Response:
        return handler_input.response_builder.speak("Listo.").response


class FallbackIntentHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        req = handler_input.request_envelope.request
        return req.object_type == "IntentRequest" and req.intent.name == "AMAZON.FallbackIntent"

    def handle(self, handler_input: HandlerInput) -> Response:
        speak_output = "No entendí. Podés decir: ¿cuánta glucemia tengo?"
        return (
            handler_input.response_builder.speak(speak_output)
            .ask(speak_output)
            .response
        )


class CatchAllExceptionHandler(AbstractExceptionHandler):
    def can_handle(self, handler_input: HandlerInput, exception: Exception) -> bool:
        return True

    def handle(self, handler_input: HandlerInput, exception: Exception) -> Response:
        speak_output = "Ocurrió un error. Intentá de nuevo."
        return handler_input.response_builder.speak(speak_output).ask(speak_output).response


sb = SkillBuilder()

sb.add_request_handler(LaunchRequestHandler())
sb.add_request_handler(GetGlucoseIntentHandler())
sb.add_request_handler(HelpIntentHandler())
sb.add_request_handler(CancelOrStopIntentHandler())
sb.add_request_handler(FallbackIntentHandler())

sb.add_exception_handler(CatchAllExceptionHandler())

lambda_handler = sb.lambda_handler()
