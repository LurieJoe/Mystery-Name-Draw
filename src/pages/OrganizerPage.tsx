import Header from "../components/Header";
import { useExchangeContext } from "../exchange/context";
import SettingsStep from "./steps/SettingsStep";
import ReviewStep from "./steps/ReviewStep";
import CreatedStep from "./steps/CreatedStep";
import InvitationStep from "./steps/InvitationStep";
import ManageStep from "./steps/ManageStep";
import ValidationStep from "./steps/ValidationStep";

/** The organizer's wizard: one step visible at a time. */
export default function OrganizerPage() {
  const {
    eventName,
    eventCode,
    organizerName,
    registrationDeadline,
    drawDate,
    giftBudget,
    invitees,
    resetExchange,
    currentStep,
  } = useExchangeContext();

  return (
    <>
      <Header
  onStartExchange={() => {

    const hasExchangeData =
      eventName.trim() ||
      drawDate ||
      registrationDeadline ||
      giftBudget ||
      eventCode ||
      organizerName.trim() ||
      invitees.length > 0;

    if (hasExchangeData) {

      const confirmed = window.confirm(
        "Start a new gift exchange?\n\n" +
        "This will clear the current gift exchange and all unsaved changes."
      );

      if (!confirmed) {
        return;
      }
    }

    resetExchange();
  }}
/>

      <div className="create-event-page">
        {currentStep === 1 && <SettingsStep />}
        {currentStep === 2 && <ReviewStep />}
        {currentStep === 3 && <CreatedStep />}
        {currentStep === 4 && <InvitationStep />}
        {currentStep === 5 && <ManageStep />}
        {currentStep === 6 && <ValidationStep />}
      </div>
    </>
  );
}
